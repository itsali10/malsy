import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, require_admin
from ..database import get_db
from ..models import ParentNotification, User
from ..schemas import NotificationCreate, NotificationRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/parent", response_model=List[NotificationRead])
async def get_parent_notifications(
    parent_email: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — parents can fetch their notifications by email."""
    result = await db.execute(
        select(ParentNotification)
        .where(ParentNotification.parent_email == parent_email)
        .order_by(ParentNotification.sent_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=NotificationRead, status_code=status.HTTP_201_CREATED)
async def send_notification(
    payload: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    notification = ParentNotification(
        user_id=payload.user_id,
        parent_email=str(payload.parent_email),
        notification_type=payload.notification_type,
        subject=payload.subject,
        message=payload.message,
        related_content_id=payload.related_content_id,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.put("/{notification_id}/read", response_model=NotificationRead)
async def mark_as_read(
    notification_id: uuid.UUID,
    parent_email: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ParentNotification).where(
            ParentNotification.notification_id == notification_id,
            ParentNotification.parent_email == parent_email,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    notification.read_at = datetime.utcnow()
    await db.commit()
    await db.refresh(notification)
    return notification
