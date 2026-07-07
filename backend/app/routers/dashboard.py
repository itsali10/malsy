import logging
from datetime import datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Schedule, StudentScheduleEnrollment, User
from ..schedule_sync_service import registry_key_from_db_subject, visible_registry_subject_keys
from ..schemas import (
    ContinueLearningRead,
    ContinueLearningSubjectRead,
    LessonScheduleSessionRead,
    MySubjectRead,
    ScheduleRead,
    WeekDayLessonScheduleRead,
)
from ..student_portal_service import fetch_student_portal_subjects
from ..student_resume_service import get_continue_learning_for_student
from ..lesson_schedule_service import fetch_student_weekly_schedule

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _schedule_subject_visible(schedule: Schedule, visible_keys: set[str]) -> bool:
    if not schedule.subject:
        return False
    key = registry_key_from_db_subject(schedule.subject.subject_name)
    return key in visible_keys


@router.get("/next-session", response_model=ScheduleRead | None)
async def next_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the student's next upcoming session today, or None if no more sessions today."""
    visible_keys = visible_registry_subject_keys()
    today = datetime.now().strftime("%A")   # e.g. "Monday"
    now_time = datetime.now().time()

    result = await db.execute(
        select(Schedule)
        .join(StudentScheduleEnrollment, StudentScheduleEnrollment.schedule_id == Schedule.schedule_id)
        .where(
            StudentScheduleEnrollment.user_id == current_user.user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
            Schedule.day_of_week == today,
            Schedule.start_time > now_time,
            Schedule.is_active == True,
        )
        .options(selectinload(Schedule.subject))
        .order_by(Schedule.start_time.asc())
    )
    for schedule in result.scalars().all():
        if _schedule_subject_visible(schedule, visible_keys):
            return schedule
    return None


@router.get("/my-week", response_model=List[WeekDayLessonScheduleRead])
async def my_week(
    selected_day: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the student's day-based weekly lesson schedule (no fixed times)."""
    week_data = await fetch_student_weekly_schedule(
        current_user.user_id,
        db,
        auto_generate=True,
        selected_day=selected_day,
    )
    week = [
        WeekDayLessonScheduleRead(
            day_of_week=day["day_of_week"],
            sessions=[LessonScheduleSessionRead(**s) for s in day["sessions"]],
        )
        for day in week_data
    ]
    total = sum(len(d.sessions) for d in week)
    by_day_counts = {day.day_of_week: len(day.sessions) for day in week}
    logger.info(
        "[portal] my-week user=%s days=%s total_sessions=%s by_day=%s",
        current_user.user_id,
        [d.day_of_week for d in week],
        total,
        by_day_counts,
    )
    return week


@router.get("/my-subjects", response_model=List[MySubjectRead])
async def my_subjects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct enrolled subjects — same source as GET /portal/subjects."""
    rows = await fetch_student_portal_subjects(current_user.user_id, db)
    return [
        MySubjectRead(
            subject_id=row["subject_id"],
            subject_key=row["subject_key"],
            subject_name=row["subject_name"],
            subject_code=row["subject_code"],
            subject_type=row.get("subject_type"),
            enrolled_sessions_count=row.get("enrolled_sessions_count", 0),
            available_lessons_count=int(row.get("available_lessons_count") or 0),
            icon=row.get("icon"),
            grade=row.get("grade"),
            primary_book_id=row.get("primary_book_id"),
            route=row.get("route"),
            scheduled_today=bool(row.get("scheduled_today")),
        )
        for row in rows
    ]


@router.get("/continue-learning", response_model=ContinueLearningRead)
async def continue_learning(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume points per subject — where each student should continue."""
    rows = await fetch_student_portal_subjects(current_user.user_id, db)
    payload = get_continue_learning_for_student(str(current_user.user_id), rows)
    return ContinueLearningRead(
        student_id=payload["student_id"],
        subjects=[ContinueLearningSubjectRead(**s) for s in payload.get("subjects") or []],
        primary=ContinueLearningSubjectRead(**payload["primary"]) if payload.get("primary") else None,
    )
