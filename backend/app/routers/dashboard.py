from datetime import datetime, time
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Schedule, StudentScheduleEnrollment, Subject, User
from ..schemas import MySubjectRead, ScheduleRead, WeekDayRead

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/next-session", response_model=ScheduleRead | None)
async def next_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the student's next upcoming session today, or None if no more sessions today."""
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
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/my-week", response_model=List[WeekDayRead])
async def my_week(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the student's enrolled sessions grouped by day of week."""
    result = await db.execute(
        select(Schedule)
        .join(StudentScheduleEnrollment, StudentScheduleEnrollment.schedule_id == Schedule.schedule_id)
        .where(
            StudentScheduleEnrollment.user_id == current_user.user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
            Schedule.is_active == True,
        )
        .options(selectinload(Schedule.subject))
        .order_by(Schedule.start_time.asc())
    )
    schedules = result.scalars().all()

    # Group by day in week order
    by_day: dict[str, list] = {}
    for s in schedules:
        by_day.setdefault(s.day_of_week, []).append(s)

    return [
        WeekDayRead(day_of_week=day, sessions=by_day[day])
        for day in DAY_ORDER
        if day in by_day
    ]


@router.get("/my-subjects", response_model=List[MySubjectRead])
async def my_subjects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct subjects the student is enrolled in, with session count."""
    result = await db.execute(
        select(
            Subject,
            func.count(StudentScheduleEnrollment.enrollment_id).label("enrolled_sessions_count"),
        )
        .join(Schedule, Schedule.subject_id == Subject.subject_id)
        .join(StudentScheduleEnrollment, StudentScheduleEnrollment.schedule_id == Schedule.schedule_id)
        .where(
            StudentScheduleEnrollment.user_id == current_user.user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
        )
        .group_by(Subject.subject_id)
        .order_by(Subject.subject_name)
    )
    rows = result.all()

    return [
        MySubjectRead(
            subject_id=row.Subject.subject_id,
            subject_name=row.Subject.subject_name,
            subject_code=row.Subject.subject_code,
            subject_type=row.Subject.subject_type,
            enrolled_sessions_count=row.enrolled_sessions_count,
        )
        for row in rows
    ]
