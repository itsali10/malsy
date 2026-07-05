"""
Seeds the default subjects and schedule slots on first use,
then auto-enrolls a newly registered user in all 7 slots.

Subjects:  English, Chemistry, History
Slots:
  English   · Grammar       · Monday     09:00–10:00
  English   · Comprehension · Wednesday  09:00–10:00
  English   · Pronunciation · Friday     09:00–10:00
  Chemistry · Theoretical   · Tuesday    10:00–11:00
  Chemistry · Practical Lab · Thursday   10:00–12:00
  History   · Videos        · Monday     11:00–12:00
  History   · Theoretical   · Wednesday  11:00–12:00
"""

import uuid
from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Schedule, StudentScheduleEnrollment, Subject
from .schedule_sync_service import registry_key_from_db_subject

# ── Canonical subject definitions ─────────────────────────────────────────────

_SUBJECTS = [
    {"subject_name": "English",   "subject_code": "ENG",  "subject_type": "English"},
    {"subject_name": "Chemistry", "subject_code": "CHEM", "subject_type": "Chemistry"},
    {"subject_name": "History",   "subject_code": "HIST", "subject_type": "History"},
]

_TYPE_BY_CODE = {s["subject_code"]: s["subject_type"] for s in _SUBJECTS}

# ── Canonical schedule slots ──────────────────────────────────────────────────
# Each entry references a subject_code so we can look up the FK at runtime.

_SLOTS = [
    {
        "subject_code": "ENG",
        "day_of_week":  "Monday",
        "start_time":   time(9, 0),
        "end_time":     time(10, 0),
        "session_type": "Grammar",
        "location":     "Room 101",
    },
    {
        "subject_code": "ENG",
        "day_of_week":  "Wednesday",
        "start_time":   time(9, 0),
        "end_time":     time(10, 0),
        "session_type": "Comprehension",
        "location":     "Room 101",
    },
    {
        "subject_code": "ENG",
        "day_of_week":  "Friday",
        "start_time":   time(9, 0),
        "end_time":     time(10, 0),
        "session_type": "Pronunciation",
        "location":     "Room 101",
    },
    {
        "subject_code": "CHEM",
        "day_of_week":  "Tuesday",
        "start_time":   time(10, 0),
        "end_time":     time(11, 0),
        "session_type": "Theoretical",
        "location":     "Room 201",
    },
    {
        "subject_code": "CHEM",
        "day_of_week":  "Thursday",
        "start_time":   time(10, 0),
        "end_time":     time(12, 0),
        "session_type": "Practical Lab",
        "location":     "Lab 1",
    },
    {
        "subject_code": "HIST",
        "day_of_week":  "Monday",
        "start_time":   time(11, 0),
        "end_time":     time(12, 0),
        "session_type": "Videos",
        "location":     "Room 301",
    },
    {
        "subject_code": "HIST",
        "day_of_week":  "Wednesday",
        "start_time":   time(11, 0),
        "end_time":     time(12, 0),
        "session_type": "Theoretical",
        "location":     "Room 301",
    },
]


async def _ensure_subjects(db: AsyncSession) -> dict[str, uuid.UUID]:
    """Return {subject_code: subject_id}, creating missing subjects."""
    code_to_id: dict[str, uuid.UUID] = {}

    for s in _SUBJECTS:
        subject_type = _TYPE_BY_CODE[s["subject_code"]]
        result = await db.execute(
            select(Subject).where(
                (Subject.subject_code == s["subject_code"])
                | (Subject.subject_type == subject_type)
            ).limit(1)
        )
        subject = result.scalars().first()
        if subject is None:
            subject = Subject(**s)
            db.add(subject)
            await db.flush()  # get generated PK without full commit
        code_to_id[s["subject_code"]] = subject.subject_id

    return code_to_id


async def _active_schedule_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Return all active schedule IDs already present in the database."""
    result = await db.execute(
        select(Schedule.schedule_id).where(Schedule.is_active.is_(True))
    )
    return [row[0] for row in result]


async def _ensure_schedules(
    db: AsyncSession, code_to_id: dict[str, uuid.UUID]
) -> list[uuid.UUID]:
    """Return canonical timetable slot IDs — match real DB rows, never all active schedules."""
    from .timetable_service import is_sync_spread_slot

    _SESSION_TYPE_MAP = {
        "Grammar": "Lesson",
        "Comprehension": "Lesson",
        "Pronunciation": "Lesson",
        "Theoretical": "Lesson",
        "Practical Lab": "Lab",
        "Videos": "Video",
    }

    schedule_ids: list[uuid.UUID] = []

    for slot in _SLOTS:
        subject_id = code_to_id[slot["subject_code"]]
        session_type = _SESSION_TYPE_MAP.get(slot["session_type"], "Lesson")
        result = await db.execute(
            select(Schedule).where(
                Schedule.subject_id == subject_id,
                Schedule.day_of_week == slot["day_of_week"],
                Schedule.start_time == slot["start_time"],
                Schedule.is_active.is_(True),
            )
        )
        schedule = result.scalar_one_or_none()
        if schedule is None:
            result = await db.execute(
                select(Schedule).where(
                    Schedule.subject_id == subject_id,
                    Schedule.day_of_week == slot["day_of_week"],
                    Schedule.session_type == session_type,
                    Schedule.is_active.is_(True),
                )
            )
            schedule = result.scalar_one_or_none()
        if schedule is None:
            schedule = Schedule(
                subject_id=subject_id,
                day_of_week=slot["day_of_week"],
                start_time=slot["start_time"],
                end_time=slot["end_time"],
                session_type=session_type,
                location=slot["location"],
                is_active=True,
            )
            db.add(schedule)
            await db.flush()
        if not is_sync_spread_slot(schedule):
            schedule_ids.append(schedule.schedule_id)

    # Also pick up real timetable rows for visible subjects (English Literature, World History, etc.)
    code_to_registry = {"ENG": "english", "CHEM": "science", "HIST": "history"}
    result = await db.execute(
        select(Schedule)
        .where(Schedule.is_active.is_(True))
        .options(selectinload(Schedule.subject))
    )
    for schedule in result.scalars().all():
        if is_sync_spread_slot(schedule):
            continue
        if schedule.schedule_id in schedule_ids:
            continue
        subj = schedule.subject
        if not subj:
            continue
        key = registry_key_from_db_subject(subj.subject_name)
        if key in code_to_registry.values():
            schedule_ids.append(schedule.schedule_id)

    return list(dict.fromkeys(schedule_ids))


async def enroll_user_in_default_schedules(
    db: AsyncSession, user_id: uuid.UUID
) -> None:
    """
    Idempotently enroll *user_id* in all 7 default schedule slots.
    Safe to call multiple times — skips slots the user is already enrolled in.
    """
    code_to_id   = await _ensure_subjects(db)
    schedule_ids = await _ensure_schedules(db, code_to_id)

    for schedule_id in schedule_ids:
        existing = await db.execute(
            select(StudentScheduleEnrollment).where(
                StudentScheduleEnrollment.user_id     == user_id,
                StudentScheduleEnrollment.schedule_id == schedule_id,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(StudentScheduleEnrollment(
                user_id             = user_id,
                schedule_id         = schedule_id,
                enrollment_status   = "Active",
            ))

    await db.commit()
