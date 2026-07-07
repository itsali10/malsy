"""
Per-student randomized weekly timetable on signup.

Each student gets 16 personal schedule slots (2× each session type), spread across
Sun–Thu only (Friday and Saturday are always off):

  English (8): Comprehension ×2, Grammar ×2, Listening ×2, Pronunciation ×2
  Science (4): Theoretical ×2, Practical ×2
  History (4): Videos ×2, Theoretical ×2
"""

from __future__ import annotations

import random
import uuid
from collections import defaultdict
from datetime import time
from typing import Dict, List, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Schedule, StudentScheduleEnrollment
from .schedule_sync_service import _ensure_db_subject
from .weekly_schedule_planner import DAY_ORDER, REST_DAYS_FIXED

STUDENT_SLOT_PREFIX = "MALSY:STUDENT:"

# Sun–Thu only; Friday and Saturday are always rest days
_WEEKDAY_POOL = [d for d in DAY_ORDER if d not in REST_DAYS_FIXED]

_TIME_SLOTS: List[Tuple[time, time]] = [
    (time(9, 0), time(10, 0)),
    (time(10, 0), time(11, 0)),
    (time(11, 0), time(12, 0)),
    (time(13, 0), time(14, 0)),
    (time(14, 0), time(15, 0)),
]

# subject registry key → session label (one of each type)
_BASE_SESSION_DEFS: List[Tuple[str, str]] = [
    ("english", "Comprehension"),
    ("english", "Grammar"),
    ("english", "Listening"),
    ("english", "Pronunciation"),
    ("science", "Theoretical"),
    ("science", "Practical"),
    ("history", "Videos"),
    ("history", "Theoretical"),
]

# Two of each session type
_SESSION_DEFS: List[Tuple[str, str]] = _BASE_SESSION_DEFS * 2
_COPIES_PER_SESSION = 2

_LABEL_TO_REGISTRY: Dict[str, str] = {label: key for key, label in _BASE_SESSION_DEFS}

# Display label → DB session_type (schedules table has a check constraint)
_SESSION_TYPE_MAP: Dict[str, str] = {
    "Comprehension": "Lesson",
    "Grammar": "Lesson",
    "Listening": "Lesson",
    "Pronunciation": "Lesson",
    "Theoretical": "Lesson",
    "Practical": "Lab",
    "Videos": "Video",
}


def student_slot_location(user_id: uuid.UUID, session_label: str = "") -> str:
    base = f"{STUDENT_SLOT_PREFIX}{user_id}"
    if session_label:
        return f"{base}|{session_label}"
    return base


def is_student_personal_slot(schedule: Schedule) -> bool:
    return (schedule.location or "").startswith(STUDENT_SLOT_PREFIX)


def student_slot_belongs_to(schedule: Schedule, user_id: uuid.UUID) -> bool:
    loc = schedule.location or ""
    return loc.startswith(f"{STUDENT_SLOT_PREFIX}{user_id}")


def session_label_from_schedule(schedule: Schedule) -> str:
    loc = schedule.location or ""
    if "|" in loc:
        return loc.split("|", 1)[1]
    return (schedule.session_type or "Lesson").strip()


async def student_has_personal_timetable(db: AsyncSession, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(StudentScheduleEnrollment.enrollment_id)
        .join(Schedule, Schedule.schedule_id == StudentScheduleEnrollment.schedule_id)
        .where(
            StudentScheduleEnrollment.user_id == user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
            Schedule.location.like(f"{STUDENT_SLOT_PREFIX}%"),
            Schedule.is_active.is_(True),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def fetch_student_personal_schedules(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> List[Schedule]:
    """Return this student's personal timetable rows, ordered by day then time."""
    result = await db.execute(
        select(Schedule)
        .join(
            StudentScheduleEnrollment,
            StudentScheduleEnrollment.schedule_id == Schedule.schedule_id,
        )
        .where(
            StudentScheduleEnrollment.user_id == user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
            Schedule.location.like(f"{STUDENT_SLOT_PREFIX}{user_id}%"),
            Schedule.is_active.is_(True),
        )
        .options(selectinload(Schedule.subject))
        .order_by(Schedule.day_of_week, Schedule.start_time)
    )
    rows = list(result.scalars().all())
    rows.sort(key=lambda s: (_day_sort_key(s.day_of_week), s.start_time))
    return rows


def _day_sort_key(day: str) -> int:
    try:
        return DAY_ORDER.index(day)
    except ValueError:
        return 99


def _even_day_counts(n_sessions: int, n_days: int) -> List[int]:
    """Split *n_sessions* across *n_days* as evenly as possible (every day gets ≥1 when n ≥ days)."""
    counts = [n_sessions // n_days] * n_days
    for i in range(n_sessions % n_days):
        counts[i] += 1
    return counts


def _pick_time_on_day(
    rng: random.Random,
    day: str,
    subject_id: uuid.UUID,
    used: set[Tuple[uuid.UUID, str, time]],
    day_times_used: set[time],
) -> Tuple[time, time]:
    """Pick a time block on *day* that is free for this subject and not double-booked for the student."""
    slots = list(_TIME_SLOTS)
    rng.shuffle(slots)
    for start, end in slots:
        if start in day_times_used:
            continue
        if (subject_id, day, start) not in used:
            return start, end
    return _pick_random_slot(rng, used, subject_id)[1:]


def _plan_slot_assignments(
    rng: random.Random,
    session_defs: List[Tuple[str, str]],
    subject_ids: Dict[str, uuid.UUID],
    used: set[Tuple[uuid.UUID, str, time]],
) -> List[Tuple[str, str, str, time, time]]:
    """
    Assign each session to a Sun–Thu day/time so every learning day has sessions.
    Returns (registry_key, label, day, start, end) tuples.
    """
    days = list(_WEEKDAY_POOL)
    counts = _even_day_counts(len(session_defs), len(days))
    perm_days = list(days)
    rng.shuffle(perm_days)

    day_queue: List[str] = []
    for day, count in zip(perm_days, counts):
        day_queue.extend([day] * count)

    defs = list(session_defs)
    rng.shuffle(defs)

    day_times_used: Dict[str, set[time]] = {d: set() for d in days}
    assignments: List[Tuple[str, str, str, time, time]] = []

    for (registry_key, label), day in zip(defs, day_queue):
        subject_id = subject_ids[registry_key]
        start, end = _pick_time_on_day(rng, day, subject_id, used, day_times_used[day])
        day_times_used[day].add(start)
        used.add((subject_id, day, start))
        assignments.append((registry_key, label, day, start, end))

    return assignments


async def create_random_schedule_for_student(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> List[uuid.UUID]:
    """
    Create 16 randomized personal timetable slots for *user_id* and enroll them.
    Idempotent — skips when the student already has a full personal timetable.
    """
    existing = await fetch_student_personal_schedules(db, user_id)
    if existing and len(existing) >= len(_SESSION_DEFS):
        return [s.schedule_id for s in existing]

    rng = random.Random()

    registry_keys = sorted({key for key, _ in _SESSION_DEFS})
    subject_ids: Dict[str, uuid.UUID] = {}
    for key in registry_keys:
        subject = await _ensure_db_subject(db, key)
        subject_ids[key] = subject.subject_id

    used_day_time = await _occupied_schedule_slots(db)
    assignments = _plan_slot_assignments(rng, list(_SESSION_DEFS), subject_ids, used_day_time)
    created_ids: List[uuid.UUID] = []

    for registry_key, label, day, start, end in assignments:
        schedule = Schedule(
            subject_id=subject_ids[registry_key],
            day_of_week=day,
            start_time=start,
            end_time=end,
            session_type=_SESSION_TYPE_MAP.get(label, "Lesson"),
            location=student_slot_location(user_id, label),
            is_active=True,
        )
        db.add(schedule)
        await db.flush()
        created_ids.append(schedule.schedule_id)

        db.add(
            StudentScheduleEnrollment(
                user_id=user_id,
                schedule_id=schedule.schedule_id,
                enrollment_status="Active",
            )
        )

    await db.flush()
    return created_ids


def _pick_random_slot(
    rng: random.Random,
    used: set[Tuple[uuid.UUID, str, time]],
    subject_id: uuid.UUID,
) -> Tuple[str, time, time]:
    """Pick a random Sun–Thu block unique for this subject (DB unique constraint)."""
    days = list(_WEEKDAY_POOL)
    slots = list(_TIME_SLOTS)
    rng.shuffle(days)

    for day in days:
        rng.shuffle(slots)
        for start, end in slots:
            if (subject_id, day, start) not in used:
                return day, start, end

    day = rng.choice(_WEEKDAY_POOL)
    start, end = rng.choice(_TIME_SLOTS)
    return day, start, end


async def _occupied_schedule_slots(
    db: AsyncSession,
    *,
    exclude_schedule_ids: set[uuid.UUID] | None = None,
) -> set[Tuple[uuid.UUID, str, time]]:
    """Slots already taken in ``schedules`` (subject + day + start)."""
    exclude_schedule_ids = exclude_schedule_ids or set()
    result = await db.execute(
        select(Schedule.schedule_id, Schedule.subject_id, Schedule.day_of_week, Schedule.start_time).where(
            Schedule.is_active.is_(True),
        )
    )
    occupied: set[Tuple[uuid.UUID, str, time]] = set()
    for schedule_id, subject_id, day, start in result.all():
        if schedule_id in exclude_schedule_ids:
            continue
        occupied.add((subject_id, day, start))
    return occupied


def _user_id_from_personal_location(location: str) -> uuid.UUID | None:
    """Parse user id from ``MALSY:STUDENT:{uuid}|{label}``."""
    loc = (location or "").strip()
    if not loc.startswith(STUDENT_SLOT_PREFIX):
        return None
    rest = loc[len(STUDENT_SLOT_PREFIX) :]
    user_part = rest.split("|", 1)[0]
    try:
        return uuid.UUID(user_part)
    except ValueError:
        return None


async def _delete_personal_timetable(db: AsyncSession, user_id: uuid.UUID) -> int:
    schedules = await fetch_student_personal_schedules(db, user_id)
    if not schedules:
        return 0
    ids = [s.schedule_id for s in schedules]
    await db.execute(
        delete(StudentScheduleEnrollment).where(
            StudentScheduleEnrollment.schedule_id.in_(ids),
        )
    )
    await db.execute(delete(Schedule).where(Schedule.schedule_id.in_(ids)))
    await db.flush()
    return len(ids)


def _timetable_is_compliant(schedules: List[Schedule]) -> bool:
    if len(schedules) != len(_SESSION_DEFS):
        return False
    if any(s.day_of_week in REST_DAYS_FIXED for s in schedules):
        return False
    if {s.day_of_week for s in schedules} != set(_WEEKDAY_POOL):
        return False
    by_label: Dict[str, int] = defaultdict(int)
    for row in schedules:
        by_label[session_label_from_schedule(row)] += 1
    return all(by_label.get(label, 0) == _COPIES_PER_SESSION for _, label in _BASE_SESSION_DEFS)


async def upgrade_personal_timetable_for_student(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> Dict[str, int]:
    """Ensure 2× each session type and Sun–Thu-only even distribution for one student."""
    schedules = await fetch_student_personal_schedules(db, user_id)
    if schedules and _timetable_is_compliant(schedules):
        return {"added": 0, "moved": 0, "total": len(schedules), "rebuilt": 0}

    if not schedules:
        created = await create_random_schedule_for_student(db, user_id)
        return {"added": len(created), "moved": 0, "total": len(created), "rebuilt": 0}

    deleted = await _delete_personal_timetable(db, user_id)
    created = await create_random_schedule_for_student(db, user_id)
    return {"added": len(created), "moved": deleted, "total": len(created), "rebuilt": 1}


async def upgrade_all_personal_timetables(
    db: AsyncSession,
    *,
    regenerate_lesson_schedules: bool = True,
) -> Dict[str, object]:
    """
    Upgrade every personal timetable: 2× each session type, Sun–Thu only, all learning days used.
  Optionally regenerate the current week's lesson schedule view for each student.
    """
    result = await db.execute(
        select(Schedule)
        .where(
            Schedule.location.like(f"{STUDENT_SLOT_PREFIX}%"),
            Schedule.is_active.is_(True),
        )
        .order_by(Schedule.location, Schedule.day_of_week, Schedule.start_time)
    )
    all_rows = list(result.scalars().all())
    by_user: Dict[uuid.UUID, List[Schedule]] = {}
    for row in all_rows:
        uid = _user_id_from_personal_location(row.location or "")
        if uid is None:
            continue
        by_user.setdefault(uid, []).append(row)

    stats = {
        "students_updated": 0,
        "slots_added": 0,
        "slots_moved": 0,
        "user_ids": [],
    }

    for user_id in sorted(by_user.keys(), key=str):
        try:
            row_stats = await upgrade_personal_timetable_for_student(db, user_id)
            if row_stats.get("rebuilt") or row_stats.get("added"):
                stats["students_updated"] += 1
                stats["slots_added"] += row_stats.get("added", 0)
                stats["slots_moved"] += row_stats.get("moved", 0)
                stats["user_ids"].append(str(user_id))
            await db.commit()
        except Exception as exc:
            await db.rollback()
            stats.setdefault("errors", []).append({"user_id": str(user_id), "error": str(exc)})

    if regenerate_lesson_schedules and stats["user_ids"]:
        from .lesson_schedule_service import generate_lesson_schedule_for_student

        for uid_str in stats["user_ids"]:
            await generate_lesson_schedule_for_student(db, uuid.UUID(uid_str), force=True)
        await db.commit()

    return stats


async def rebalance_personal_timetables(
    db: AsyncSession,
    *,
    only_rest_days: bool = True,
) -> Dict[str, object]:
    """
    Backward-compatible alias — upgrades timetables to 2× each session on Sun–Thu.
    The *only_rest_days* flag is ignored; all personal timetables are normalized.
    """
    del only_rest_days
    return await upgrade_all_personal_timetables(db, regenerate_lesson_schedules=True)


async def enroll_user_in_default_schedules(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """Backward-compatible alias — creates the randomized personal timetable."""
    await create_random_schedule_for_student(db, user_id)
    await db.commit()
