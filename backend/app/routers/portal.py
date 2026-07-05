from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import StudentPortalSubjectRead
from ..student_portal_service import fetch_student_portal_subjects, search_student_portal

router = APIRouter(prefix="/portal", tags=["Student Portal"])


@router.get("/subjects", response_model=List[StudentPortalSubjectRead])
async def portal_subjects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Canonical list of subjects for this student (Dashboard, Schedule, Lessons, Search)."""
    rows = await fetch_student_portal_subjects(current_user.user_id, db)
    return [StudentPortalSubjectRead(**row) for row in rows]


@router.get("/search", response_model=List[StudentPortalSubjectRead])
async def portal_search(
    q: Optional[str] = Query("", alias="q"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search subjects available to the logged-in student."""
    rows = await search_student_portal(current_user.user_id, db, q or "")
    return [StudentPortalSubjectRead(**row) for row in rows]
