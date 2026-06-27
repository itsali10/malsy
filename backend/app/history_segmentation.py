"""
MALSY History Lesson Segmentation — catalog-driven lesson detection and part splitting.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

from .history_lessons import (
    BOOKS_ROOT,
    lessons_for_ui as catalog_lessons_for_ui,
    load_lessons_catalog,
    split_history_lesson_into_parts,
    validate_lesson_catalog,
)

# Headings / markers for automatic lesson boundary detection from raw book text.
_HISTORY_LESSON_HEADING_RE = re.compile(
    r"(?im)^(?:\d+[\).:\s]+)?([A-Z][^\n]{8,80})\s*$"
)
_NON_TEACHABLE_SECTION_RE = re.compile(
    r"(?im)\b(worksheet|activity|research project|timeline task|artefact task|"
    r"congratulations|cover page|project instructions?)\b"
)


def detect_history_lessons(
    book_text: str,
    *,
    book_id: str = "history_g6",
) -> List[Dict[str, Any]]:
    """
    Detect History lesson sections from book text using headings and topic shifts.

    If a catalog already exists, prefer it (single source of truth).
    """
    catalog_path = os.path.join(BOOKS_ROOT, book_id, "lessons.json")
    if os.path.exists(catalog_path):
        catalog = load_lessons_catalog(book_id)
        return list(catalog.get("lessons") or [])

    lessons: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    for line in (book_text or "").splitlines():
        stripped = line.strip()
        if not stripped or _NON_TEACHABLE_SECTION_RE.search(stripped):
            continue
        m = _HISTORY_LESSON_HEADING_RE.match(stripped)
        if m:
            title = m.group(1).strip()
            if re.search(r"(?i)\b(introduction|overview|welcome|getting started)\b", title):
                continue
            if current:
                lessons.append(current)
            current = {
                "title": title,
                "sourceSectionTitle": title,
                "ownedSourceText": "",
                "allowedTopics": [],
            }
        elif current is not None:
            current["ownedSourceText"] = (
                current.get("ownedSourceText", "") + "\n" + stripped
            ).strip()
    if current:
        lessons.append(current)

    for i, lesson in enumerate(lessons, start=1):
        lesson.setdefault("lessonNumber", i)
        lesson.setdefault("unit_id", f"unit_{i:02d}")
        lesson.setdefault("id", f"{book_id}:unit_{i:02d}")
    return lessons


def split_history_lesson_into_parts_for_lesson(lesson: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Public alias matching pipeline naming."""
    return split_history_lesson_into_parts(lesson)


def segment_book_lessons(book_id: str) -> Dict[str, Any]:
    catalog = load_lessons_catalog(book_id)
    validate_lesson_catalog(book_id)
    lessons: List[Dict[str, Any]] = []
    for lesson in catalog.get("lessons") or []:
        parts = split_history_lesson_into_parts(lesson)
        lessons.append({
            "lessonNumber": lesson.get("lessonNumber"),
            "title": lesson.get("title"),
            "description": lesson.get("shortDescription"),
            "contentStartSection": lesson.get("sourceSectionTitle") or lesson.get("title"),
            "contentEndSection": lesson.get("sourceSectionTitle") or lesson.get("title"),
            "unit_id": lesson.get("unit_id"),
            "lesson_id": lesson.get("id"),
            "start_page": lesson.get("start_page"),
            "end_page": lesson.get("end_page"),
            "allowedTopics": lesson.get("allowedTopics"),
            "forbiddenTopics": lesson.get("forbiddenTopics"),
            "videoParts": lesson.get("videoParts"),
            "parts": parts,
            "videoFilename": lesson.get("videoFilename"),
            "videoType": lesson.get("videoType"),
        })
    return {
        "subject": catalog.get("subject", "History"),
        "unit": catalog.get("unit", book_id),
        "book_id": book_id,
        "lessons": lessons,
    }


def lessons_for_ui(book_id: str) -> List[Dict[str, Any]]:
    return catalog_lessons_for_ui(book_id)
