"""Student lesson catalog synced from processed book manifests (all subjects)."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

BOOKS_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "books")


def _book_dir(book_id: str) -> str:
    return os.path.join(BOOKS_ROOT, book_id)


def _lessons_path(book_id: str) -> str:
    return os.path.join(_book_dir(book_id), "lessons.json")


def _manifest_path(book_id: str) -> str:
    return os.path.join(_book_dir(book_id), "manifest.json")


def lesson_number_from_unit_id(unit_id: str) -> int:
    """Extract sequential lesson number from unit_01_lesson_05 or unit_05."""
    text = (unit_id or "").split(":")[-1]
    m = re.search(r"_lesson_(\d+)$", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"unit_(\d+)$", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return 0


def _plan_titles_by_unit(book_id: str) -> Dict[str, str]:
    try:
        from .canonical_plan_store import load_book_plan

        plan = load_book_plan(book_id)
    except Exception:
        plan = None
    out: Dict[str, str] = {}
    for u in (plan or {}).get("units") or []:
        short = str(u.get("unit_id") or "")
        title = (u.get("title") or "").strip()
        if short and title:
            out[short] = title
        real = str(u.get("real_unit_id") or "")
        if real and title:
            out[real.split(":")[-1]] = title
    return out


def sync_lessons_catalog_from_manifest(book_id: str) -> Dict[str, Any]:
    """Build or refresh lessons.json from manifest units + plan titles."""
    manifest_path = _manifest_path(book_id)
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(f"No manifest for book: {book_id}")

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    units = sorted(manifest.get("units") or [], key=lambda u: int(u.get("start_page") or 0))
    if not units:
        raise ValueError(f"Manifest has no units: {book_id}")

    plan_titles = _plan_titles_by_unit(book_id)
    subject = str(manifest.get("subject") or book_id.split("_")[0])
    grade = int(manifest.get("grade") or 6)
    book_title = manifest.get("title") or book_id

    lessons: List[Dict[str, Any]] = []
    for i, unit in enumerate(units):
        short_id = str(unit.get("unit_id") or f"unit_{i + 1:02d}")
        lesson_num = lesson_number_from_unit_id(short_id) or (i + 1)
        title = plan_titles.get(short_id) or (unit.get("title") or "").strip() or f"Lesson {lesson_num}"
        start = int(unit.get("start_page") or 1)
        end = int(unit.get("end_page") or start)
        full_id = f"{book_id}:{short_id}"
        lessons.append(
            {
                "id": full_id,
                "unit_id": short_id,
                "lessonNumber": lesson_num,
                "title": title,
                "shortDescription": f"Pages {start}–{end}",
                "start_page": start,
                "end_page": end,
                "videoType": "lessonVideo",
                "videoFilename": None,
                "allowedTopics": [],
            }
        )

    catalog = {
        "book_id": book_id,
        "subject": subject,
        "grade": grade,
        "unit": book_title,
        "title": book_title,
        "lessons": lessons,
        "source": "manifest_sync",
    }

    os.makedirs(_book_dir(book_id), exist_ok=True)
    with open(_lessons_path(book_id), "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
        f.write("\n")

    try:
        from .lesson_content_mapping import load_book_mappings, sync_book_lesson_mappings

        sync_book_lesson_mappings(book_id)
        mappings = load_book_mappings(book_id).get("lessons") or {}
        for lesson in catalog.get("lessons") or []:
            lid = str(lesson.get("id") or "")
            m = mappings.get(lid)
            if m:
                lesson["chunk_ids"] = m.get("chunk_ids") or []
                lesson["chunk_count"] = m.get("chunk_count") or len(lesson["chunk_ids"])
    except Exception:
        pass

    return catalog


def _catalog_is_history_rich(catalog: Dict[str, Any]) -> bool:
    lessons = catalog.get("lessons") or []
    if not lessons:
        return False
    first = lessons[0]
    return bool(first.get("allowedTopics")) and catalog.get("source") != "manifest_sync"


def ensure_lessons_catalog(book_id: str) -> Dict[str, Any]:
    """Load lessons.json; sync from manifest when missing (non-history books)."""
    path = _lessons_path(book_id)
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            catalog = json.load(f)
        if _catalog_is_history_rich(catalog):
            return catalog
        if (catalog.get("lessons") or []) and catalog.get("source") == "manifest_sync":
            return catalog
    return sync_lessons_catalog_from_manifest(book_id)


def load_lessons_catalog(book_id: str) -> Dict[str, Any]:
    path = _lessons_path(book_id)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No lesson catalog for book: {book_id}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_student_lessons_response(book_id: str) -> Dict[str, Any]:
    """API payload for student lesson cards (Science, History, custom subjects)."""
    from .lesson_catalog_service import part_count_for_book

    part_count = part_count_for_book(book_id)
    if os.path.isfile(_lessons_path(book_id)):
        with open(_lessons_path(book_id), encoding="utf-8") as f:
            catalog = json.load(f)
        if _catalog_is_history_rich(catalog):
            from .history_lessons import get_lessons_api_response

            return get_lessons_api_response(book_id)
    else:
        catalog = sync_lessons_catalog_from_manifest(book_id)

    lessons_out: List[Dict[str, Any]] = []
    for lesson in catalog.get("lessons") or []:
        lessons_out.append(
            {
                "id": lesson.get("id"),
                "lessonNumber": lesson.get("lessonNumber"),
                "unit_id": lesson.get("unit_id"),
                "subject": catalog.get("subject"),
                "grade": catalog.get("grade"),
                "unit": catalog.get("unit"),
                "title": lesson.get("title"),
                "shortDescription": lesson.get("shortDescription"),
                "start_page": lesson.get("start_page"),
                "end_page": lesson.get("end_page"),
                "videoFilename": lesson.get("videoFilename"),
                "videoType": lesson.get("videoType"),
                "partCount": part_count,
            }
        )

    return {
        "book_id": book_id,
        "subject": catalog.get("subject"),
        "grade": catalog.get("grade"),
        "unit": catalog.get("unit"),
        "lessons": lessons_out,
        "partCount": part_count,
    }
