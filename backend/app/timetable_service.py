"""Real student weekly timetable from DB enrollments — no subject-spread placeholders."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Schedule, StudentScheduleEnrollment, User
from .schedule_sync_service import registry_key_from_db_subject, visible_registry_subject_keys
from .subject_registry import get_subject_record
from .student_portal_service import (
    DAY_ORDER,
    _primary_book_id,
    _subject_icon,
    _subject_visibility_reason,
    display_subject_code,
    display_subject_name,
)

logger = logging.getLogger(__name__)

MALSY_SYNC_PREFIX = "MALSY:"

from .default_schedule import (
    is_student_personal_slot,
    session_label_from_schedule,
    student_has_personal_timetable,
    student_slot_belongs_to,
)


def is_sync_spread_slot(schedule: Schedule) -> bool:
    """True for auto-generated one-subject-per-day placeholder slots."""
    loc = schedule.location or ""
    if loc.startswith("MALSY:STUDENT:"):
        return False
    return loc.startswith(MALSY_SYNC_PREFIX)


def _day_sort_key(day: str) -> int:
    try:
        return DAY_ORDER.index(day)
    except ValueError:
        return 99


async def ensure_student_timetable_enrollment(
    user_id,
    db: AsyncSession,
) -> Dict[str, Any]:
    """
    Idempotently enroll the student in real timetable rows (non-MALSY slots)
    for published visible subjects at the student's grade.
    """
    user = await db.get(User, user_id)
    if not user or user.role != "student":
        return {"skipped": True, "reason": "not a student"}

    if await student_has_personal_timetable(db, user_id):
        return {
            "skipped": True,
            "reason": "student has personal randomized timetable",
            "user_id": str(user_id),
        }

    grade = int(user.grade_level or 6)
    visible_keys = visible_registry_subject_keys()

    result = await db.execute(
        select(Schedule)
        .where(Schedule.is_active.is_(True))
        .options(selectinload(Schedule.subject))
        .order_by(Schedule.day_of_week, Schedule.start_time)
    )
    all_slots = list(result.scalars().all())

    created = 0
    reactivated = 0
    examined: List[Dict[str, Any]] = []

    for schedule in all_slots:
        subject = schedule.subject
        db_name = subject.subject_name if subject else ""
        registry_key = registry_key_from_db_subject(db_name) if subject else ""

        if is_student_personal_slot(schedule):
            continue

        if is_sync_spread_slot(schedule):
            examined.append(
                {
                    "schedule_id": str(schedule.schedule_id),
                    "day": schedule.day_of_week,
                    "subject": db_name,
                    "action": "skipped",
                    "reason": "sync-spread placeholder slot (MALSY marker)",
                }
            )
            continue

        ok, reason = _subject_visibility_reason(registry_key, grade=grade, visible_keys=visible_keys)
        if not ok:
            examined.append(
                {
                    "schedule_id": str(schedule.schedule_id),
                    "day": schedule.day_of_week,
                    "subject": db_name,
                    "action": "skipped",
                    "reason": reason,
                }
            )
            continue

        existing = await db.execute(
            select(StudentScheduleEnrollment).where(
                StudentScheduleEnrollment.user_id == user_id,
                StudentScheduleEnrollment.schedule_id == schedule.schedule_id,
            )
        )
        row = existing.scalar_one_or_none()
        if row is None:
            db.add(
                StudentScheduleEnrollment(
                    user_id=user_id,
                    schedule_id=schedule.schedule_id,
                    enrollment_status="Active",
                )
            )
            created += 1
            action = "enrolled"
        elif row.enrollment_status != "Active":
            row.enrollment_status = "Active"
            row.drop_date = None
            reactivated += 1
            action = "reactivated"
        else:
            action = "already_enrolled"

        examined.append(
            {
                "schedule_id": str(schedule.schedule_id),
                "day": schedule.day_of_week,
                "time": str(schedule.start_time),
                "subject": db_name,
                "session_type": schedule.session_type,
                "location": schedule.location,
                "action": action,
                "reason": reason,
            }
        )

    if created or reactivated:
        await db.flush()

    payload = {
        "user_id": str(user_id),
        "grade": grade,
        "real_slots_examined": len(examined),
        "enrollments_created": created,
        "enrollments_reactivated": reactivated,
    }
    logger.info("[timetable] ensure_student_timetable_enrollment %s", payload)
    logger.info("[timetable] slot decisions user=%s %s", user_id, examined)
    return payload


async def fetch_student_timetable_sessions(
    user_id,
    db: AsyncSession,
    *,
    ensure_enrollment: bool = True,
) -> Tuple[List[Schedule], List[Dict[str, Any]]]:
    """
    Return enrolled timetable sessions for the student (real slots only).
    Also returns audit log of include/exclude decisions.
    """
    if ensure_enrollment:
        await ensure_student_timetable_enrollment(user_id, db)

    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6
    visible_keys = visible_registry_subject_keys()

    result = await db.execute(
        select(Schedule)
        .join(
            StudentScheduleEnrollment,
            StudentScheduleEnrollment.schedule_id == Schedule.schedule_id,
        )
        .where(
            StudentScheduleEnrollment.user_id == user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
            Schedule.is_active.is_(True),
        )
        .options(selectinload(Schedule.subject))
        .order_by(Schedule.day_of_week, Schedule.start_time)
    )
    enrolled = list(result.scalars().all())

    logger.info(
        "[timetable] fetched raw enrollments user=%s count=%s",
        user_id,
        len(enrolled),
    )

    included: List[Schedule] = []
    audit: List[Dict[str, Any]] = []

    for schedule in enrolled:
        subject = schedule.subject
        db_name = subject.subject_name if subject else ""
        registry_key = registry_key_from_db_subject(db_name) if subject else ""

        if is_student_personal_slot(schedule):
            if student_slot_belongs_to(schedule, user_id):
                included.append(schedule)
                audit.append(
                    {
                        "schedule_id": str(schedule.schedule_id),
                        "day": schedule.day_of_week,
                        "time": str(schedule.start_time),
                        "subject": db_name,
                        "session_type": session_label_from_schedule(schedule),
                        "included": True,
                        "reason": "personal randomized slot",
                    }
                )
            continue

        if is_sync_spread_slot(schedule):
            audit.append(
                {
                    "schedule_id": str(schedule.schedule_id),
                    "day": schedule.day_of_week,
                    "subject": db_name,
                    "included": False,
                    "reason": "excluded sync-spread placeholder (MALSY marker)",
                }
            )
            continue

        ok, reason = _subject_visibility_reason(registry_key, grade=grade, visible_keys=visible_keys)
        if not ok:
            audit.append(
                {
                    "schedule_id": str(schedule.schedule_id),
                    "day": schedule.day_of_week,
                    "subject": db_name,
                    "included": False,
                    "reason": reason,
                }
            )
            continue

        included.append(schedule)
        audit.append(
            {
                "schedule_id": str(schedule.schedule_id),
                "day": schedule.day_of_week,
                "time": str(schedule.start_time),
                "subject": db_name,
                "session_type": schedule.session_type,
                "included": True,
                "reason": reason,
            }
        )

    by_day = {day: sum(1 for s in included if s.day_of_week == day) for day in DAY_ORDER}
    logger.info(
        "[timetable] generated schedule by day user=%s total=%s by_day=%s",
        user_id,
        len(included),
        by_day,
    )
    logger.info("[timetable] session audit user=%s %s", user_id, audit)
    return included, audit


async def fetch_enrolled_subjects_from_timetable(
    user_id,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """Distinct subjects from real enrolled timetable sessions (My Subjects source)."""
    from datetime import datetime

    sessions, _audit = await fetch_student_timetable_sessions(user_id, db)
    today = datetime.now().strftime("%A")
    visible_keys = visible_registry_subject_keys()
    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6

    aggregated: Dict[str, Dict[str, Any]] = {}
    today_keys: Set[str] = set()

    for schedule in sessions:
        subject = schedule.subject
        if not subject:
            continue
        db_name = subject.subject_name or ""
        registry_key = registry_key_from_db_subject(db_name)
        book_id = _primary_book_id(registry_key, grade=grade)

        if schedule.day_of_week == today:
            today_keys.add(registry_key)

        bucket = aggregated.get(registry_key)
        if bucket is None:
            rec = get_subject_record(registry_key) or {}
            bucket = {
                "subject_id": subject.subject_id,
                "subject_key": registry_key,
                "subject_name": display_subject_name(registry_key, db_name),
                "subject_code": display_subject_code(registry_key, subject.subject_code or ""),
                "subject_type": subject.subject_type,
                "icon": _subject_icon(registry_key),
                "grade": int(rec.get("grade") or grade),
                "primary_book_id": book_id,
                "route": f"/lessons/subject/{registry_key}",
                "available_lessons_count": 0,
                "scheduled_today": False,
                "search_terms": [],
            }
            aggregated[registry_key] = bucket

    out: List[Dict[str, Any]] = []
    for key, row in aggregated.items():
        row["scheduled_today"] = key in today_keys
        name = str(row["subject_name"])
        row["search_terms"] = sorted(
            {name.lower(), key.lower(), str(row.get("primary_book_id") or "").lower()}
        )
        out.append(row)

    out.sort(key=lambda r: str(r.get("subject_name") or ""))
    logger.info(
        "[timetable] fetched enrolled subjects user=%s subjects=%s visible_keys=%s",
        user_id,
        [(r["subject_key"], r["subject_name"], r.get("available_lessons_count", 0)) for r in out],
        sorted(visible_keys),
    )
    return out
