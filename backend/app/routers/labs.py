import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import ExperimentSession, LabExperiment, User
from ..schemas import (
    ExperimentSessionCreate,
    ExperimentSessionRead,
    ExperimentSessionUpdate,
    LabExperimentRead,
)

router = APIRouter(prefix="/labs", tags=["Labs"])


@router.get("/experiments", response_model=List[LabExperimentRead])
async def list_experiments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LabExperiment)
        .options(selectinload(LabExperiment.subject))
        .order_by(LabExperiment.experiment_name)
    )
    return result.scalars().all()


@router.get("/experiments/{experiment_id}", response_model=LabExperimentRead)
async def get_experiment(
    experiment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LabExperiment)
        .where(LabExperiment.experiment_id == experiment_id)
        .options(selectinload(LabExperiment.subject))
    )
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp


@router.post("/sessions", response_model=ExperimentSessionRead, status_code=status.HTTP_201_CREATED)
async def start_session(
    payload: ExperimentSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exp_result = await db.execute(
        select(LabExperiment).where(LabExperiment.experiment_id == payload.experiment_id)
    )
    if not exp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Experiment not found")

    session = ExperimentSession(
        user_id=current_user.user_id,
        experiment_id=payload.experiment_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    result = await db.execute(
        select(ExperimentSession)
        .where(ExperimentSession.session_id == session.session_id)
        .options(selectinload(ExperimentSession.experiment).selectinload(LabExperiment.subject))
    )
    return result.scalar_one()


@router.put("/sessions/{session_id}", response_model=ExperimentSessionRead)
async def update_session(
    session_id: uuid.UUID,
    payload: ExperimentSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ExperimentSession).where(
            ExperimentSession.session_id == session_id,
            ExperimentSession.user_id == current_user.user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(session, field, value)

    if payload.session_status == "Completed" and session.end_time is None:
        session.end_time = datetime.utcnow()

    await db.commit()

    refreshed = await db.execute(
        select(ExperimentSession)
        .where(ExperimentSession.session_id == session_id)
        .options(selectinload(ExperimentSession.experiment).selectinload(LabExperiment.subject))
    )
    return refreshed.scalar_one()


@router.get("/sessions/me", response_model=List[ExperimentSessionRead])
async def my_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ExperimentSession)
        .where(ExperimentSession.user_id == current_user.user_id)
        .options(selectinload(ExperimentSession.experiment).selectinload(LabExperiment.subject))
        .order_by(ExperimentSession.start_time.desc())
    )
    return result.scalars().all()
