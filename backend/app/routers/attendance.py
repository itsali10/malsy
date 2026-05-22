import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_admin
from ..database import get_db
from ..models import Attendance, User
from ..schemas import AttendanceCreate, AttendanceRead

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/me", response_model=List[AttendanceRead])
async def my_attendance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Attendance)
        .where(Attendance.user_id == current_user.user_id)
        .order_by(Attendance.session_date.desc())
    )
    return result.scalars().all()


@router.get("/me/subject/{subject_id}", response_model=List[AttendanceRead])
async def my_attendance_by_subject(
    subject_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Attendance)
        .where(
            Attendance.user_id == current_user.user_id,
            Attendance.subject_id == subject_id,
        )
        .order_by(Attendance.session_date.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AttendanceRead, status_code=status.HTTP_201_CREATED)
async def record_attendance(
    payload: AttendanceCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    existing = await db.execute(
        select(Attendance).where(
            Attendance.user_id == payload.user_id,
            Attendance.schedule_id == payload.schedule_id,
            Attendance.session_date == payload.session_date,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Attendance already recorded for this session")

    record = Attendance(**payload.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
