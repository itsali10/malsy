import uuid
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Schedule, StudentScheduleEnrollment, User
from ..schemas import EnrollmentCreate, EnrollmentRead

router = APIRouter(prefix="/enrollments", tags=["Enrollments"])


@router.get("/me", response_model=List[EnrollmentRead])
async def my_enrollments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentScheduleEnrollment)
        .where(
            StudentScheduleEnrollment.user_id == current_user.user_id,
            StudentScheduleEnrollment.enrollment_status == "Active",
        )
        .options(
            selectinload(StudentScheduleEnrollment.schedule).selectinload(Schedule.subject)
        )
    )
    return result.scalars().all()


@router.post("", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
async def enroll(
    payload: EnrollmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    schedule_result = await db.execute(
        select(Schedule).where(Schedule.schedule_id == payload.schedule_id, Schedule.is_active == True)
    )
    if not schedule_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Schedule not found or inactive")

    existing = await db.execute(
        select(StudentScheduleEnrollment).where(
            StudentScheduleEnrollment.user_id == current_user.user_id,
            StudentScheduleEnrollment.schedule_id == payload.schedule_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already enrolled in this schedule")

    enrollment = StudentScheduleEnrollment(
        user_id=current_user.user_id,
        schedule_id=payload.schedule_id,
        enrollment_date=date.today(),
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)

    result = await db.execute(
        select(StudentScheduleEnrollment)
        .where(StudentScheduleEnrollment.enrollment_id == enrollment.enrollment_id)
        .options(selectinload(StudentScheduleEnrollment.schedule).selectinload(Schedule.subject))
    )
    return result.scalar_one()


@router.delete("/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def drop_enrollment(
    enrollment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentScheduleEnrollment).where(
            StudentScheduleEnrollment.enrollment_id == enrollment_id,
            StudentScheduleEnrollment.user_id == current_user.user_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    if enrollment.enrollment_status != "Active":
        raise HTTPException(status_code=400, detail="Enrollment is not active")

    enrollment.enrollment_status = "Dropped"
    enrollment.drop_date = date.today()
    await db.commit()
