from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import EnglishQuizAttempt, User
from ..schemas import QuizAttemptCreate, QuizAttemptRead

router = APIRouter(prefix="/quiz", tags=["Quiz"])


@router.post("/attempts", response_model=QuizAttemptRead, status_code=status.HTTP_201_CREATED)
async def submit_attempt(
    payload: QuizAttemptCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attempt = EnglishQuizAttempt(
        user_id=current_user.user_id,
        **payload.model_dump(),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


@router.get("/attempts/me", response_model=List[QuizAttemptRead])
async def my_attempts(
    content_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(EnglishQuizAttempt).where(EnglishQuizAttempt.user_id == current_user.user_id)
    if content_id:
        query = query.where(EnglishQuizAttempt.content_id == content_id)
    query = query.order_by(EnglishQuizAttempt.attempt_timestamp.desc())

    result = await db.execute(query)
    return result.scalars().all()
