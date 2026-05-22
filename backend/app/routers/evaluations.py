from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import LessonEvaluation, User
from ..schemas import LessonEvaluationCreate, LessonEvaluationRead

router = APIRouter(prefix="/evaluations", tags=["Evaluations"])


@router.get("/me", response_model=List[LessonEvaluationRead])
async def my_evaluations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LessonEvaluation)
        .where(LessonEvaluation.user_id == current_user.user_id)
        .order_by(LessonEvaluation.created_at.desc())
    )
    return result.scalars().all()


@router.get("/me/{content_id}", response_model=LessonEvaluationRead | None)
async def my_evaluation_for_lesson(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LessonEvaluation).where(
            LessonEvaluation.user_id == current_user.user_id,
            LessonEvaluation.content_id == content_id,
        )
    )
    return result.scalar_one_or_none()


@router.post("", response_model=LessonEvaluationRead, status_code=status.HTTP_201_CREATED)
async def create_evaluation(
    payload: LessonEvaluationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    evaluation = LessonEvaluation(
        user_id=current_user.user_id,
        **payload.model_dump(),
    )
    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation
