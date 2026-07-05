"""Link processed, visible books to the student schedule (DB enrollments)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import time
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .book_registry import get_book_record, is_book_visible_to_students, normalize_subject_key, upsert_book_record
from .database import AsyncSessionLocal
from .models import Schedule, StudentScheduleEnrollment, Subject, User
from .subject_registry import get_subject_record

logger = logging.getLogger(__name__)

_BUILTIN_DB: Dict[str, Tuple[str, str, str]] = {
    "english": ("English", "ENG", "English"),
    "science": ("Chemistry", "CHEM", "Chemistry"),
    "history": ("History", "HIST", "History"),
}

_CUSTOM_DAYS = ("Tuesday", "Thursday", "Saturday", "Friday", "Monday", "Wednesday", "Sunday")


def registry_key_from_db_subject(subject_name: str) -> str:
    name = (subject_name or "").strip().lower()
    if name == "english" or name.startswith("english "):
        return "english"
    if name in ("chemistry", "science") or name.startswith("chemistry"):
        return "science"
    if name == "history" or "history" in name:
        return "history"
    return normalize_subject_key(subject_name) or name.replace(" ", "_")


def display_subject_name(registry_key: str, db_name: str) -> str:
    if registry_key == "science" and db_name.lower() == "chemistry":
        return "Science"
    rec = get_subject_record(registry_key)
    if rec:
        return rec.get("subject_name") or db_name
    return db_name


def visible_registry_subject_keys() -> Set[str]:
    from .book_registry import list_book_records

    keys: Set[str] = set()
    for rec in list_book_records(include_archived=False):
        book_id = rec.get("book_id")
        if book_id and is_book_visible_to_students(book_id):
            key = normalize_subject_key(rec.get("subject") or book_id)
            if key:
                keys.add(key)
    return keys


def is_book_visible_in_student_schedule(book_id: str) -> bool:
    rec = get_book_record(book_id)
    if not rec:
        return False
    if not is_book_visible_to_students(book_id):
        return False
    return bool(rec.get("schedule_in_student_portal"))


def schedule_status_label(book_id: Optional[str]) -> str:
    if not book_id:
        return "Not visible in schedule yet"
    rec = get_book_record(book_id)
    if not rec:
        return "Not visible in schedule yet"
    if not is_book_visible_to_students(book_id):
        return "Not visible in schedule yet"
    if rec.get("schedule_in_student_portal"):
        return "Visible in student schedule"
    return "Not visible in schedule yet"


async def _ensure_db_subject(
    db: AsyncSession,
    registry_key: str,
) -> Subject:
    if registry_key in _BUILTIN_DB:
        name, code, stype = _BUILTIN_DB[registry_key]
    else:
        rec = get_subject_record(registry_key)
        name = (rec or {}).get("subject_name") or registry_key.replace("_", " ").title()
        code = registry_key.upper().replace("_", "")[:6] or "SUBJ"
        stype = name

    result = await db.execute(
        select(Subject).where(
            (Subject.subject_code == code) | (Subject.subject_name == name)
        ).limit(1)
    )
    subject = result.scalars().first()
    if subject is None:
        subject = Subject(subject_name=name, subject_code=code, subject_type=stype)
        db.add(subject)
        await db.flush()
    return subject


async def _schedule_ids_for_subject(
    db: AsyncSession,
    subject: Subject,
    *,
    registry_key: str,
    book_id: str,
    grade: int,
) -> List[uuid.UUID]:
    """Return real timetable schedule IDs for a subject — never spread placeholders if real slots exist."""
    from .timetable_service import is_sync_spread_slot

    result = await db.execute(
        select(Schedule)
        .where(Schedule.is_active.is_(True))
        .options(selectinload(Schedule.subject))
    )
    matching: List[Schedule] = []
    for schedule in result.scalars().all():
        if not schedule.subject:
            continue
        if registry_key_from_db_subject(schedule.subject.subject_name) != registry_key:
            continue
        if is_sync_spread_slot(schedule):
            continue
        matching.append(schedule)

    if matching:
        ids = [s.schedule_id for s in matching]
        logger.info(
            "[schedule-sync] using real timetable slots book=%s subject=%s count=%s",
            book_id,
            registry_key,
            len(ids),
        )
        return ids

    # Legacy: same subject_id rows (builtin subject row)
    result = await db.execute(
        select(Schedule).where(
            Schedule.subject_id == subject.subject_id,
            Schedule.is_active.is_(True),
        )
    )
    existing = [s for s in result.scalars().all() if not is_sync_spread_slot(s)]
    if existing:
        return [s.schedule_id for s in existing]

    day = _CUSTOM_DAYS[hash(f"{registry_key}:{grade}") % len(_CUSTOM_DAYS)]
    marker = f"MALSY:{registry_key}:g{grade}"
    schedule = Schedule(
        subject_id=subject.subject_id,
        day_of_week=day,
        start_time=time(14, 0),
        end_time=time(15, 0),
        session_type="Lesson",
        location=marker,
        is_active=True,
    )
    db.add(schedule)
    await db.flush()
    logger.warning(
        "[schedule-sync] no real slots — created placeholder book=%s subject=%s day=%s",
        book_id,
        registry_key,
        day,
    )
    return [schedule.schedule_id]


async def _eligible_student_ids(db: AsyncSession, grade: int) -> List[uuid.UUID]:
    result = await db.execute(
        select(User.user_id).where(
            User.role == "student",
            User.account_status == "Active",
            User.grade_level == int(grade),
        )
    )
    return [row[0] for row in result.all()]


async def sync_book_to_student_schedule(
    db: AsyncSession,
    book_id: str,
) -> Dict[str, Any]:
    """Enroll grade-matched students when book is fully visible. Idempotent."""
    rec = get_book_record(book_id)
    if not rec:
        return {"synced": False, "reason": "book not found", "book_id": book_id}

    registry_key = normalize_subject_key(rec.get("subject") or book_id)
    grade = int(rec.get("grade") or 6)

    if not is_book_visible_to_students(book_id):
        upsert_book_record(
            book_id,
            schedule_in_student_portal=False,
        )
        logger.info(
            "[schedule-sync] skipped book=%s subject=%s grade=%s reason=not visible to students",
            book_id,
            registry_key,
            grade,
        )
        return {
            "synced": False,
            "reason": "book not visible to students",
            "book_id": book_id,
            "subject_key": registry_key,
            "grade": grade,
        }

    subject = await _ensure_db_subject(db, registry_key or book_id.split("_")[0])
    schedule_ids = await _schedule_ids_for_subject(
        db,
        subject,
        registry_key=registry_key or book_id.split("_")[0],
        book_id=book_id,
        grade=grade,
    )
    student_ids = await _eligible_student_ids(db, grade)

    created = 0
    updated = 0
    for user_id in student_ids:
        for schedule_id in schedule_ids:
            existing = await db.execute(
                select(StudentScheduleEnrollment).where(
                    StudentScheduleEnrollment.user_id == user_id,
                    StudentScheduleEnrollment.schedule_id == schedule_id,
                )
            )
            row = existing.scalar_one_or_none()
            if row is None:
                db.add(
                    StudentScheduleEnrollment(
                        user_id=user_id,
                        schedule_id=schedule_id,
                        enrollment_status="Active",
                    )
                )
                created += 1
            elif row.enrollment_status != "Active":
                row.enrollment_status = "Active"
                row.drop_date = None
                updated += 1

    await db.flush()

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    upsert_book_record(
        book_id,
        schedule_in_student_portal=True,
        schedule_sync_at=now,
        schedule_students_affected=len(student_ids),
        schedule_entries_created=created,
        schedule_entries_updated=updated,
        schedule_session_count=len(schedule_ids),
    )

    log_payload = {
        "synced": True,
        "book_id": book_id,
        "subject_key": registry_key,
        "grade": grade,
        "generated_sessions_count": len(schedule_ids),
        "students_affected": len(student_ids),
        "schedule_entries_created": created,
        "schedule_entries_updated": updated,
    }
    logger.info("[schedule-sync] %s", log_payload)
    return log_payload


async def sync_subject_books_to_schedule(db: AsyncSession, subject_key: str) -> List[Dict[str, Any]]:
    from .book_registry import books_for_subject

    results: List[Dict[str, Any]] = []
    for book in books_for_subject(subject_key, include_archived=False):
        book_id = book.get("book_id")
        if not book_id:
            continue
        results.append(await sync_book_to_student_schedule(db, book_id))
    return results


def run_schedule_sync_for_book(book_id: str) -> Dict[str, Any]:
    async def _run() -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            try:
                result = await sync_book_to_student_schedule(db, book_id)
                await db.commit()
                return result
            except Exception:
                await db.rollback()
                raise

    return asyncio.run(_run())


def run_schedule_sync_for_subject(subject_key: str) -> List[Dict[str, Any]]:
    async def _run() -> List[Dict[str, Any]]:
        async with AsyncSessionLocal() as db:
            try:
                results = await sync_subject_books_to_schedule(db, subject_key)
                await db.commit()
                return results
            except Exception:
                await db.rollback()
                raise

    return asyncio.run(_run())
