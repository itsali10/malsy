"""Weekly school-style lesson timetables for students (no fixed clock times)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .book_lessons_catalog import ensure_lessons_catalog, lesson_number_from_unit_id
from .book_registry import get_primary_book, is_book_visible_to_students
from .models import LessonEvaluation, StudentLessonScheduleItem, Subject, User
from .schedule_sync_service import (
    display_subject_name,
    registry_key_from_db_subject,
    visible_registry_subject_keys,
    _ensure_db_subject,
)
from .default_schedule import (
    fetch_student_personal_schedules,
    session_label_from_schedule,
    student_has_personal_timetable,
)
from .weekly_schedule_planner import (
    DAY_ORDER,
    REST_DAYS_FIXED,
    generate_weekly_plan,
    student_week_seed,
    sunday_of_week,
    validate_weekly_plan,
)

logger = logging.getLogger(__name__)

STATUS_LOCKED = "locked"
STATUS_AVAILABLE = "available"
STATUS_COMPLETED = "completed"
STATUS_MISSED = "missed"

BLOATED_SCHEDULE_THRESHOLD = 40

# Timetable session label → teaching section index (language) or legacy part
_SESSION_LABEL_UNIT_PART: Dict[str, int] = {
    "comprehension": 0,
    "reading": 0,
    "grammar": 1,
    "listening": 2,
    "pronunciation": 3,
    "theoretical": 0,
    "practical": 1,
    "videos": 0,
}


def encode_schedule_lesson_id(chapter_id: str, session_label: str, *, duplicate_index: int = 0) -> str:
    """Unique per-slot lesson_id (DB constraint) while preserving chapter + session type."""
    slug = (session_label or "lesson").lower().replace(" ", "_")
    if duplicate_index > 0:
        return f"{chapter_id}::{slug}#{duplicate_index}"
    return f"{chapter_id}::{slug}"


def decode_schedule_lesson_id(lesson_id: str) -> tuple[str, str, int]:
    """Return (chapter_id, session_label_slug, duplicate_index)."""
    raw = (lesson_id or "").strip()
    if "::" not in raw:
        return raw, "", 0
    base, tag = raw.split("::", 1)
    if "#" in tag:
        label, idx_s = tag.rsplit("#", 1)
        try:
            return base, label, int(idx_s)
        except ValueError:
            return base, tag, 0
    return base, tag, 0


def _is_legacy_slot_lesson_id(lesson_id: str) -> bool:
    """Old placeholder ids like ``english:grammar`` (not a real chapter)."""
    raw = (lesson_id or "").strip()
    if not raw or "::" in raw:
        return False
    if "unit_" in raw:
        return False
    parts = raw.split(":")
    return len(parts) == 2 and parts[0] in {"english", "science", "history"}


def unit_part_for_session_label(registry_key: str, session_label: str, book_id: str) -> int:
    from .language_lesson_sections import uses_language_sections

    label = (session_label or "").strip().lower()
    if registry_key == "english" or uses_language_sections(book_id):
        return _SESSION_LABEL_UNIT_PART.get(label, 0)
    if registry_key == "science":
        return 1 if label == "practical" else 0
    return _SESSION_LABEL_UNIT_PART.get(label, 0)


def _format_time(t: Optional[Any]) -> Optional[str]:
    if t is None:
        return None
    if hasattr(t, "strftime"):
        return t.strftime("%H:%M")
    return str(t)[:5]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_lesson_id(lesson_id: str) -> str:
    return (lesson_id or "").strip()


def _lesson_sort_key(lesson: Dict[str, Any]) -> int:
    num = lesson.get("lessonNumber")
    if num is not None:
        return int(num)
    unit_id = lesson.get("unit_id") or lesson.get("id") or ""
    return lesson_number_from_unit_id(str(unit_id))


def collect_subject_sequences(grade: int) -> Dict[str, List[Dict[str, Any]]]:
    """Ordered lesson sequences per subject (published, visible books only)."""
    sequences: Dict[str, List[Dict[str, Any]]] = {}
    for registry_key in sorted(visible_registry_subject_keys()):
        book = get_primary_book(registry_key, grade=grade)
        if not book:
            continue
        book_id = str(book.get("book_id") or "")
        if int(book.get("grade") or grade) != int(grade):
            continue
        if not is_book_visible_to_students(book_id):
            continue
        try:
            catalog = ensure_lessons_catalog(book_id)
        except Exception as exc:
            logger.warning("[lesson-schedule] skip book=%s grade=%s reason=%s", book_id, grade, exc)
            continue

        lessons: List[Dict[str, Any]] = []
        for lesson in catalog.get("lessons") or []:
            lesson_id = str(lesson.get("id") or "").strip()
            if not lesson_id:
                unit_id = lesson.get("unit_id")
                if unit_id:
                    uid = str(unit_id)
                    lesson_id = uid if ":" in uid else f"{book_id}:{uid}"
            if not lesson_id:
                continue
            lessons.append(
                {
                    "lesson_id": lesson_id,
                    "registry_key": registry_key,
                    "book_id": book_id,
                    "title": str(lesson.get("title") or ""),
                    "lessonNumber": _lesson_sort_key(lesson),
                    "unit_id": lesson.get("unit_id"),
                }
            )

        lessons.sort(key=_lesson_sort_key)
        if lessons:
            sequences[registry_key] = lessons

    logger.info(
        "[lesson-schedule] subject sequences grade=%s subjects=%s counts=%s",
        grade,
        list(sequences.keys()),
        {k: len(v) for k, v in sequences.items()},
    )
    return sequences


def build_interleaved_queue(
    sequences: Dict[str, List[Dict[str, Any]]],
    completed_ids: Set[str],
) -> List[Dict[str, Any]]:
    """
    Pending lesson queue: Lesson 1 for every subject, then Lesson 2, etc.
    Only unfinished lessons are included.
    """
    subjects = sorted(sequences.keys())
    if not subjects:
        return []

    max_level = max(len(sequences[s]) for s in subjects)
    queue: List[Dict[str, Any]] = []
    for level in range(max_level):
        for registry_key in subjects:
            seq = sequences[registry_key]
            if level >= len(seq):
                continue
            lesson = seq[level]
            lid = _normalize_lesson_id(lesson["lesson_id"])
            if lid not in completed_ids:
                queue.append(lesson)
    return queue


def _sequences_for_student_grade(grade: int) -> Dict[str, List[Dict[str, Any]]]:
    """Lesson sequences for a grade, falling back to grade 6 when none are published."""
    sequences = collect_subject_sequences(grade)
    if sequences:
        return sequences
    if grade != 6:
        return collect_subject_sequences(6)
    return sequences


def collect_lessons_for_grade(grade: int) -> List[Dict[str, Any]]:
    """Flat list of all lessons (legacy helper — prefer subject sequences)."""
    out: List[Dict[str, Any]] = []
    for lessons in _sequences_for_student_grade(grade).values():
        out.extend(lessons)
    return out


async def _completed_lesson_ids(db: AsyncSession, user_id: uuid.UUID) -> Set[str]:
    result = await db.execute(
        select(LessonEvaluation.content_id).where(
            LessonEvaluation.user_id == user_id,
            LessonEvaluation.lesson_completed.is_(True),
        )
    )
    return {_normalize_lesson_id(row[0]) for row in result.all() if row[0]}


async def student_has_lesson_schedule(db: AsyncSession, user_id: uuid.UUID) -> bool:
    week_start = sunday_of_week()
    return await _has_schedule_for_week(db, user_id, week_start)


async def _has_schedule_for_week(
    db: AsyncSession,
    user_id: uuid.UUID,
    week_start: date,
) -> bool:
    result = await db.execute(
        select(StudentLessonScheduleItem.schedule_item_id)
        .where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _schedule_item_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(StudentLessonScheduleItem)
        .where(StudentLessonScheduleItem.user_id == user_id)
    )
    return int(result.scalar_one() or 0)


def _recompute_unlock_chain(items: List[StudentLessonScheduleItem], now: Optional[datetime] = None) -> None:
    """Exactly one non-completed lesson is available — earliest in day order."""
    now = now or _utcnow()
    day_rank = {day: idx for idx, day in enumerate(DAY_ORDER)}

    def sort_key(row: StudentLessonScheduleItem) -> tuple:
        return (day_rank.get(row.day_of_week or "", 99), row.order_index)

    items.sort(key=sort_key)
    unlock_next = True
    for item in items:
        if item.status == STATUS_COMPLETED:
            unlock_next = True
            continue
        if unlock_next:
            item.status = STATUS_AVAILABLE
            if item.unlocked_at is None:
                item.unlocked_at = now
            unlock_next = False
        elif item.status != STATUS_MISSED:
            item.status = STATUS_LOCKED
            item.unlocked_at = None


def _next_lesson_for_subject(
    sequences: Dict[str, List[Dict[str, Any]]],
    completed_ids: Set[str],
    registry_key: str,
    *,
    skip_ids: Optional[Set[str]] = None,
) -> Optional[Dict[str, Any]]:
    skip = skip_ids or set()
    for lesson in sequences.get(registry_key, []):
        lid = _normalize_lesson_id(lesson["lesson_id"])
        if lid in completed_ids or lid in skip:
            continue
        return lesson
    return None


async def _scheduled_lesson_ids(db: AsyncSession, user_id: uuid.UUID) -> Set[str]:
    result = await db.execute(
        select(StudentLessonScheduleItem.lesson_id).where(
            StudentLessonScheduleItem.user_id == user_id,
        )
    )
    return {_normalize_lesson_id(row[0]) for row in result.all() if row[0]}


async def _delete_stale_incomplete(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_week: date,
) -> int:
    """Remove incomplete items from previous weeks before creating the new week."""
    result = await db.execute(
        delete(StudentLessonScheduleItem).where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.status != STATUS_COMPLETED,
            or_(
                StudentLessonScheduleItem.week_start_date.is_(None),
                StudentLessonScheduleItem.week_start_date != current_week,
            ),
        )
    )
    await db.flush()
    return int(result.rowcount or 0)


async def _delete_week_schedule(
    db: AsyncSession,
    user_id: uuid.UUID,
    week_start: date,
    *,
    keep_completed: bool = True,
) -> None:
    stmt = delete(StudentLessonScheduleItem).where(
        StudentLessonScheduleItem.user_id == user_id,
        StudentLessonScheduleItem.week_start_date == week_start,
    )
    if keep_completed:
        stmt = stmt.where(StudentLessonScheduleItem.status != STATUS_COMPLETED)
    await db.execute(stmt)
    await db.flush()


async def _create_week_schedule_from_timetable(
    db: AsyncSession,
    user_id: uuid.UUID,
    week_start: date,
) -> List[StudentLessonScheduleItem]:
    """Build the weekly lesson view from the student's personal randomized timetable."""
    schedules = await fetch_student_personal_schedules(db, user_id)
    if not schedules:
        return []

    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6
    sequences = _sequences_for_student_grade(grade)
    completed_ids = await _completed_lesson_ids(db, user_id)

    result = await db.execute(
        select(func.max(StudentLessonScheduleItem.order_index)).where(
            StudentLessonScheduleItem.user_id == user_id,
        )
    )
    next_order = int(result.scalar_one() or 0)

    new_items: List[StudentLessonScheduleItem] = []
    label_counts: Dict[str, int] = defaultdict(int)

    for schedule in schedules:
        subject = schedule.subject
        if not subject:
            continue
        db_name = subject.subject_name or ""
        registry_key = registry_key_from_db_subject(db_name)
        session_label = session_label_from_schedule(schedule)

        lesson = _next_lesson_for_subject(
            sequences,
            completed_ids,
            registry_key,
            skip_ids=set(),
        )
        if lesson:
            base_lid = _normalize_lesson_id(lesson["lesson_id"])
            dup_idx = label_counts[session_label]
            label_counts[session_label] += 1
            lid = encode_schedule_lesson_id(base_lid, session_label, duplicate_index=dup_idx)
        else:
            lid = f"{registry_key}:{session_label.lower().replace(' ', '_')}"

        next_order += 1
        item = StudentLessonScheduleItem(
            user_id=user_id,
            subject_id=subject.subject_id,
            lesson_id=lid,
            lesson_title=session_label,
            day_of_week=schedule.day_of_week,
            week_start_date=week_start,
            order_index=next_order,
            status=STATUS_LOCKED,
        )
        db.add(item)
        new_items.append(item)

    if not new_items:
        return []

    existing_completed = await db.execute(
        select(StudentLessonScheduleItem).where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
            StudentLessonScheduleItem.status == STATUS_COMPLETED,
        )
    )
    all_items = list(existing_completed.scalars().all()) + new_items
    _recompute_unlock_chain(all_items, _utcnow())
    await db.flush()

    by_day = {d: sum(1 for i in new_items if i.day_of_week == d) for d in DAY_ORDER}
    logger.info(
        "[lesson-schedule] created week from personal timetable user=%s week=%s sessions=%s by_day=%s",
        user_id,
        week_start,
        len(new_items),
        by_day,
    )
    return new_items


async def _create_week_schedule(
    db: AsyncSession,
    user_id: uuid.UUID,
    week_start: date,
) -> List[StudentLessonScheduleItem]:
    """Generate and persist one realistic weekly layout for a single student."""
    from_timetable = await _create_week_schedule_from_timetable(db, user_id, week_start)
    if from_timetable:
        return from_timetable

    user = await db.get(User, user_id)
    if not user:
        return []

    grade = int(user.grade_level or 6)
    sequences = _sequences_for_student_grade(grade)
    if not sequences:
        return []

    available = set(sequences.keys())
    completed_ids = await _completed_lesson_ids(db, user_id)
    already_scheduled = await _scheduled_lesson_ids(db, user_id)
    skip_ids = completed_ids | already_scheduled

    seed = student_week_seed(str(user_id), week_start)
    plan = generate_weekly_plan(available, seed=seed)
    ok, val_errors = validate_weekly_plan(plan, available)
    if not ok:
        logger.warning(
            "[lesson-schedule] plan validation user=%s week=%s errors=%s plan=%s",
            user_id,
            week_start,
            val_errors,
            {d: plan.get(d) for d in DAY_ORDER if plan.get(d)},
        )

    result = await db.execute(
        select(func.max(StudentLessonScheduleItem.order_index)).where(
            StudentLessonScheduleItem.user_id == user_id,
        )
    )
    next_order = int(result.scalar_one() or 0)

    subject_cache: Dict[str, uuid.UUID] = {}
    new_items: List[StudentLessonScheduleItem] = []
    used_lessons: Set[str] = set()

    for day in DAY_ORDER:
        if day in REST_DAYS_FIXED:
            continue
        for registry_key in plan.get(day) or []:
            if registry_key not in sequences:
                continue
            lesson = _next_lesson_for_subject(
                sequences,
                completed_ids,
                registry_key,
                skip_ids=skip_ids | used_lessons,
            )
            if not lesson:
                continue

            if registry_key not in subject_cache:
                subject = await _ensure_db_subject(db, registry_key)
                subject_cache[registry_key] = subject.subject_id

            lid = _normalize_lesson_id(lesson["lesson_id"])
            used_lessons.add(lid)
            next_order += 1
            item = StudentLessonScheduleItem(
                user_id=user_id,
                subject_id=subject_cache[registry_key],
                lesson_id=lid,
                lesson_title=str(lesson.get("title") or lid),
                day_of_week=day,
                week_start_date=week_start,
                order_index=next_order,
                status=STATUS_LOCKED,
            )
            db.add(item)
            new_items.append(item)

    if not new_items:
        return []

    # Include completed items from this week for unlock chain ordering.
    existing_completed = await db.execute(
        select(StudentLessonScheduleItem).where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
            StudentLessonScheduleItem.status == STATUS_COMPLETED,
        )
    )
    all_items = list(existing_completed.scalars().all()) + new_items
    _recompute_unlock_chain(all_items, _utcnow())
    await db.flush()

    by_day = {d: sum(1 for i in new_items if i.day_of_week == d) for d in DAY_ORDER}
    active_days = sum(1 for d in DAY_ORDER if by_day.get(d))
    logger.info(
        "[lesson-schedule] created week user=%s week=%s seed=%s sessions=%s active_days=%s by_day=%s valid=%s",
        user_id,
        week_start,
        seed,
        len(new_items),
        active_days,
        by_day,
        ok,
    )
    return new_items


async def ensure_current_week_schedule(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    force: bool = False,
) -> bool:
    """
    Ensure the student has a saved schedule for the current calendar week.
    Returns True when a new week was generated.
    """
    user = await db.get(User, user_id)
    if not user or user.role != "student" or user.account_status != "Active":
        return False

    week_start = sunday_of_week()
    has_week = await _has_schedule_for_week(db, user_id, week_start)

    if has_week and not force:
        return False

    if force and has_week:
        await _delete_week_schedule(db, user_id, week_start, keep_completed=False)

    await _delete_stale_incomplete(db, user_id, week_start)

    # Legacy rows without week_start_date block clean generation.
    legacy = await db.execute(
        select(func.count())
        .select_from(StudentLessonScheduleItem)
        .where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date.is_(None),
        )
    )
    if int(legacy.scalar_one() or 0) > 0:
        await db.execute(
            delete(StudentLessonScheduleItem).where(
                StudentLessonScheduleItem.user_id == user_id,
                StudentLessonScheduleItem.week_start_date.is_(None),
                StudentLessonScheduleItem.status != STATUS_COMPLETED,
            )
        )
        await db.flush()

    if await _has_schedule_for_week(db, user_id, week_start) and not force:
        return False

    items = await _create_week_schedule(db, user_id, week_start)
    return bool(items)


async def generate_lesson_schedule_for_student(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    force: bool = False,
    append_missing: bool = False,
) -> Dict[str, Any]:
    user = await db.get(User, user_id)
    if not user or user.role != "student" or user.account_status != "Active":
        return {"user_id": str(user_id), "skipped": True, "reason": "not an active student"}

    grade = int(user.grade_level or 6)
    has_personal = await student_has_personal_timetable(db, user_id)
    if not _sequences_for_student_grade(grade) and not has_personal:
        return {"user_id": str(user_id), "skipped": True, "reason": "no published lessons for grade"}

    week_start = sunday_of_week()
    has_week = await _has_schedule_for_week(db, user_id, week_start)
    count = await _schedule_item_count(db, user_id)

    if has_week and not force and not append_missing:
        logger.info("[lesson-schedule] skip user=%s — week %s already exists", user_id, week_start)
        return {"user_id": str(user_id), "skipped": True, "reason": "schedule already exists"}

    if count > BLOATED_SCHEDULE_THRESHOLD and not force:
        force = True

    created = await ensure_current_week_schedule(db, user_id, force=force)
    if not created and not has_week:
        return {"user_id": str(user_id), "skipped": True, "reason": "no lessons to schedule"}

    result = await db.execute(
        select(StudentLessonScheduleItem).where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
        )
    )
    items = list(result.scalars().all())

    if force:
        return {
            "user_id": str(user_id),
            "regenerated": True,
            "week_start": week_start.isoformat(),
            "total_lessons": len(items),
        }

    return {
        "user_id": str(user_id),
        "created": True,
        "week_start": week_start.isoformat(),
        "total_lessons": len(items),
    }


async def generate_lesson_schedules_for_all_students(
    db: AsyncSession,
    *,
    force: bool = False,
    append_missing: bool = False,
) -> Dict[str, Any]:
    result = await db.execute(
        select(User.user_id).where(
            User.role == "student",
            User.account_status == "Active",
        )
    )
    user_ids = [row[0] for row in result.all()]
    summary: Dict[str, Any] = {
        "students_total": len(user_ids),
        "created": 0,
        "skipped": 0,
        "appended": 0,
        "regenerated": 0,
        "errors": 0,
        "details": [],
    }

    for uid in user_ids:
        try:
            row = await generate_lesson_schedule_for_student(
                db,
                uid,
                force=force,
                append_missing=append_missing,
            )
            summary["details"].append(row)
            if row.get("created"):
                summary["created"] += 1
            elif row.get("appended"):
                summary["appended"] += 1
            elif row.get("regenerated"):
                summary["regenerated"] += 1
            elif row.get("skipped"):
                summary["skipped"] += 1
        except Exception as exc:
            summary["errors"] += 1
            summary["details"].append({"user_id": str(uid), "error": str(exc)})
            logger.exception("[lesson-schedule] failed user=%s", uid)

    logger.info("[lesson-schedule] bulk generate summary=%s", summary)
    return summary


async def mark_schedule_lesson_completed(
    db: AsyncSession,
    user_id: uuid.UUID,
    lesson_id: str,
    *,
    completed_at: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """Mark a scheduled lesson completed and advance the unlock chain (layout unchanged)."""
    lid = _normalize_lesson_id(lesson_id)
    if not lid:
        return None

    week_start = sunday_of_week()
    result = await db.execute(
        select(StudentLessonScheduleItem)
        .where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.lesson_id == lid,
        )
        .limit(1)
    )
    current = result.scalar_one_or_none()

    now = completed_at or _utcnow()
    if current and current.status != STATUS_COMPLETED:
        current.status = STATUS_COMPLETED
        current.completed_at = now

    items_result = await db.execute(
        select(StudentLessonScheduleItem)
        .where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
        )
        .order_by(StudentLessonScheduleItem.order_index)
    )
    items = list(items_result.scalars().all())
    _recompute_unlock_chain(items, now)
    await db.flush()

    next_item = next((i for i in items if i.status == STATUS_AVAILABLE), None)
    payload = {
        "lesson_id": lid,
        "order_index": current.order_index if current else None,
        "completed_at": now.isoformat(),
        "next_lesson_id": next_item.lesson_id if next_item else None,
        "next_order_index": next_item.order_index if next_item else None,
    }
    logger.info("[lesson-schedule] completed user=%s %s", user_id, payload)
    return payload


def run_lesson_schedule_generation(
    *,
    force: bool = False,
    append_missing: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Sync entry point for background jobs and CLI."""

    async def _run() -> Dict[str, Any]:
        from .database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                if user_id:
                    result = await generate_lesson_schedule_for_student(
                        db,
                        uuid.UUID(user_id),
                        force=force,
                        append_missing=append_missing,
                    )
                else:
                    result = await generate_lesson_schedules_for_all_students(
                        db,
                        force=force,
                        append_missing=append_missing,
                    )
                await db.commit()
                return result
            except Exception:
                await db.rollback()
                raise

    return asyncio.run(_run())


def run_mark_schedule_lesson_completed(user_id: str, lesson_id: str) -> None:
    async def _run() -> None:
        from .database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                await mark_schedule_lesson_completed(db, uuid.UUID(user_id), lesson_id)
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    asyncio.run(_run())


async def fetch_student_weekly_schedule(
    user_id: uuid.UUID,
    db: AsyncSession,
    *,
    auto_generate: bool = True,
    selected_day: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return the student's day-based weekly lesson schedule for the current week."""
    from sqlalchemy.orm import selectinload

    from .schedule_availability_service import evaluate_schedule_session

    week_start = sunday_of_week()
    today = datetime.now().strftime("%A")
    unlock_day = (selected_day or today).strip()

    if auto_generate:
        await ensure_current_week_schedule(db, user_id, force=False)
        await db.flush()

    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6
    sequences = _sequences_for_student_grade(grade)
    completed_ids = await _completed_lesson_ids(db, user_id)

    personal_slots = await fetch_student_personal_schedules(db, user_id)
    time_lookup = _build_timetable_time_lookup(personal_slots)

    result = await db.execute(
        select(StudentLessonScheduleItem)
        .where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
        )
        .options(selectinload(StudentLessonScheduleItem.subject))
        .order_by(StudentLessonScheduleItem.order_index)
    )
    items = list(result.scalars().all())

    by_day: Dict[str, List[Dict[str, Any]]] = {day: [] for day in DAY_ORDER}
    student_id_str = str(user_id)
    label_seen_on_day: Dict[tuple[str, str, str], int] = defaultdict(int)
    unlock_day_slot_opened = False

    for item in items:
        day = item.day_of_week or DAY_ORDER[0]
        subject: Optional[Subject] = item.subject
        db_name = subject.subject_name if subject else ""
        registry_key = registry_key_from_db_subject(db_name) if subject else ""
        session_label = (item.lesson_title or "").strip()

        chapter_id, label_slug, dup_idx = decode_schedule_lesson_id(item.lesson_id)
        if _is_legacy_slot_lesson_id(item.lesson_id) or not chapter_id or "unit_" not in chapter_id:
            lesson = _next_lesson_for_subject(sequences, completed_ids, registry_key, skip_ids=set())
            if lesson:
                chapter_id = _normalize_lesson_id(lesson["lesson_id"])
            else:
                chapter_id = item.lesson_id

        book_id = chapter_id.split(":")[0] if ":" in chapter_id else registry_key
        unit_part = unit_part_for_session_label(
            registry_key,
            session_label or label_slug.replace("_", " ").title(),
            book_id,
        )

        availability = evaluate_schedule_session(
            student_id_str,
            chapter_id,
            session_label,
        )
        effective_status = availability["status"]

        if day == unlock_day and effective_status != STATUS_COMPLETED and not unlock_day_slot_opened:
            effective_status = STATUS_AVAILABLE
            availability["lock_reason"] = None
            availability["action_label"] = (
                "Continue Lesson" if availability.get("continue_available") else "Start Lesson"
            )
            availability["continue_available"] = True
            availability["unit_part"] = unit_part
            unlock_day_slot_opened = True
        elif effective_status == STATUS_AVAILABLE:
            availability["unit_part"] = unit_part

        slot_key = (str(item.subject_id), day, session_label.lower())
        dup_n = label_seen_on_day[slot_key]
        label_seen_on_day[slot_key] += 1
        start_t, end_t = _match_slot_time(time_lookup, item.subject_id, day, session_label, dup_n)

        by_day.setdefault(day, []).append(
            {
                "schedule_item_id": item.schedule_item_id,
                "lesson_id": chapter_id,
                "lesson_title": session_label or item.lesson_id,
                "subject_id": item.subject_id,
                "subject_name": display_subject_name(registry_key, db_name) if registry_key else db_name,
                "subject_key": registry_key,
                "order_index": item.order_index,
                "status": effective_status,
                "day_of_week": day,
                "lock_reason": availability.get("lock_reason"),
                "action_label": availability.get("action_label"),
                "unit_part": int(availability.get("unit_part", unit_part) or 0),
                "continue_available": bool(availability.get("continue_available")),
                "start_time": _format_time(start_t),
                "end_time": _format_time(end_t),
            }
        )

    week = [{"day_of_week": day, "sessions": by_day.get(day, [])} for day in DAY_ORDER]
    total = sum(len(d["sessions"]) for d in week)
    by_day_counts = {day: len(by_day.get(day, [])) for day in DAY_ORDER}
    logger.info(
        "[lesson-schedule] weekly schedule user=%s total=%s by_day=%s unlock_day=%s",
        user_id,
        total,
        by_day_counts,
        unlock_day,
    )
    return week


def _build_timetable_time_lookup(
    schedules: List[Any],
) -> Dict[tuple[Any, str, str], List[Dict[str, Any]]]:
    """Group personal timetable rows by (subject_id, day, label) with sorted times."""
    buckets: Dict[tuple[Any, str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in schedules:
        label = session_label_from_schedule(row).lower()
        buckets[(row.subject_id, row.day_of_week, label)].append(
            {"start": row.start_time, "end": row.end_time}
        )
    for key in buckets:
        buckets[key].sort(key=lambda x: x["start"])
    return buckets


def _match_slot_time(
    lookup: Dict[tuple[Any, str, str], List[Dict[str, Any]]],
    subject_id: Any,
    day: str,
    session_label: str,
    duplicate_index: int,
) -> tuple[Any, Any]:
    slots = lookup.get((subject_id, day, (session_label or "").lower()), [])
    if duplicate_index < len(slots):
        hit = slots[duplicate_index]
        return hit["start"], hit["end"]
    return None, None
