"""Single source of truth for student-visible subjects across the portal."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from .models import User
from .book_registry import get_primary_book, is_book_visible_to_students
from .schedule_sync_service import (
    display_subject_name,
    registry_key_from_db_subject,
    visible_registry_subject_keys,
)
from .subject_registry import get_subject_record

logger = logging.getLogger(__name__)

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

PORTAL_SUBJECT_CODES: Dict[str, str] = {
    "english": "ENG",
    "science": "SCI",
    "history": "HIST",
}


def _subject_icon(registry_key: str) -> str:
    rec = get_subject_record(registry_key)
    return str((rec or {}).get("icon") or "📖")


def display_subject_code(registry_key: str, db_code: str) -> str:
    """Portal-facing subject code (Science → SCI, not DB Chemistry CHEM)."""
    return PORTAL_SUBJECT_CODES.get(registry_key) or (db_code or "SUB")


def _primary_book_id(registry_key: str, grade: int = 6) -> Optional[str]:
    book = get_primary_book(registry_key, grade=grade)
    if not book:
        return None
    bid = str(book.get("book_id") or "")
    if not bid or not is_book_visible_to_students(bid):
        return None
    if book.get("archived"):
        return None
    return bid


def _book_is_student_ready(book_id: Optional[str]) -> bool:
    if not book_id:
        return False
    from .book_registry import get_book_record

    rec = get_book_record(book_id)
    if not rec or rec.get("archived"):
        return False
    if not is_book_visible_to_students(book_id):
        return False
    return True


def _subject_visibility_reason(
    registry_key: str,
    *,
    grade: int,
    visible_keys: Set[str],
) -> Tuple[bool, str]:
    if registry_key not in visible_keys:
        return False, "no published visible book for subject key"
    book_id = _primary_book_id(registry_key, grade=grade)
    if not book_id:
        return False, "primary book missing or not visible to students"
    if not _book_is_student_ready(book_id):
        return False, f"book {book_id} not student-ready (archived/unprocessed/unapproved)"
    return True, f"ok book={book_id}"


async def fetch_student_portal_subjects(
    user_id,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """Distinct enrolled subjects with published lesson counts from book structure."""
    from .book_lesson_counts import attach_available_lesson_counts
    from .timetable_service import fetch_enrolled_subjects_from_timetable

    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6

    rows = await fetch_enrolled_subjects_from_timetable(user_id, db)
    return attach_available_lesson_counts(rows, default_grade=grade)


async def fetch_student_portal_schedule(user_id, db: AsyncSession):
    """Enrolled real timetable sessions for the weekly schedule view."""
    from .timetable_service import fetch_student_timetable_sessions

    sessions, _audit = await fetch_student_timetable_sessions(user_id, db)
    return sessions


async def search_student_portal(
    user_id,
    db: AsyncSession,
    query: str,
    *,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Search only within the student's enrolled, published subjects."""
    q = (query or "").strip().lower()
    subjects = await fetch_student_portal_subjects(user_id, db)
    if not q:
        return subjects[:limit]

    hits: List[Dict[str, Any]] = []
    for subj in subjects:
        haystack = " ".join(
            [
                str(subj.get("subject_name") or ""),
                str(subj.get("subject_key") or ""),
                str(subj.get("primary_book_id") or ""),
                *list(subj.get("search_terms") or []),
            ]
        ).lower()
        if q in haystack:
            hits.append(subj)
    return hits[:limit]
