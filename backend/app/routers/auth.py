import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..default_schedule import enroll_user_in_default_schedules
from ..lesson_schedule_service import generate_lesson_schedule_for_student
from ..timetable_service import ensure_student_timetable_enrollment
from ..models import User
from ..schemas import LoginRequest, Token, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    logger.info("START Register email=%s", payload.email)
    logger.info("Validate request OK email=%s grade=%s", payload.email, payload.grade_level)

    logger.info("Check existing user email=%s", payload.email)
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        logger.info("END Register — email already registered: %s", payload.email)
        raise HTTPException(status_code=400, detail="Email already registered")

    logger.info("Hash password email=%s", payload.email)
    password_hash = hash_password(payload.password)

    logger.info("Create user email=%s", payload.email)
    user = User(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        password_hash=password_hash,
        role="student",
        date_of_birth=payload.date_of_birth,
        grade_level=payload.grade_level,
        phone_number=payload.phone_number,
        guardian_name=payload.guardian_name,
        guardian_gender=payload.guardian_gender,
        guardian_email=str(payload.guardian_email),
        guardian_phone_number=payload.guardian_phone_number,
    )
    db.add(user)

    logger.info("Commit transaction email=%s", payload.email)
    await db.commit()
    await db.refresh(user)

    logger.info("Enroll in default schedules user_id=%s", user.user_id)
    await enroll_user_in_default_schedules(db, user.user_id)

    logger.info("Ensure real timetable enrollment user_id=%s", user.user_id)
    await ensure_student_timetable_enrollment(user.user_id, db)
    await db.commit()

    logger.info("Generate lesson schedule user_id=%s", user.user_id)
    await generate_lesson_schedule_for_student(db, user.user_id, force=False, append_missing=False)
    await db.commit()

    logger.info("END Register user_id=%s email=%s", user.user_id, user.email)
    return user


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if user.account_status != "Active":
        raise HTTPException(status_code=403, detail=f"Account is {user.account_status}")

    user.last_login = datetime.utcnow()

    if user.role == "student":
        from ..lesson_schedule_service import ensure_current_week_schedule

        await ensure_current_week_schedule(db, user.user_id, force=False)

    await db.commit()

    token = create_access_token({"sub": str(user.user_id), "role": user.role})
    return Token(access_token=token)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
