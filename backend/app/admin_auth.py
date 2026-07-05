"""Fixed admin credentials and JWT helpers (separate from student DB auth)."""

from __future__ import annotations

import os
import uuid
from datetime import timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    get_current_user,
)
from .database import get_db
from .models import User

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "12345")
ADMIN_SUB = "malsy-fixed-admin"
ADMIN_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/login", auto_error=True)


def verify_admin_credentials(username: str, password: str) -> bool:
    return (username or "").strip() == ADMIN_USERNAME and password == ADMIN_PASSWORD


def create_admin_access_token() -> str:
    return create_access_token(
        {"sub": ADMIN_SUB, "role": "admin", "admin": True},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES * 8),
    )


def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def is_fixed_admin_token(payload: dict) -> bool:
    return payload.get("role") == "admin" and payload.get("sub") == ADMIN_SUB


async def require_admin_access(
    token: str = Depends(admin_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Accept fixed admin JWT or a DB user with role=admin."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired admin token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = _decode_token(token)
    except JWTError:
        raise credentials_exception

    if is_fixed_admin_token(payload):
        user = User(
            user_id=ADMIN_USER_ID,
            first_name="Admin",
            last_name="MALSY",
            email="admin@malsy.local",
            password_hash="",
            role="admin",
            date_of_birth=__import__("datetime").date(2000, 1, 1),
            grade_level=0,
            phone_number="",
            guardian_name="",
            guardian_gender="",
            guardian_email="",
            guardian_phone_number="",
            account_status="Active",
        )
        return user

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception
    try:
        db_user = await get_current_user(token=token, db=db)
    except HTTPException:
        raise credentials_exception
    if db_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return db_user
