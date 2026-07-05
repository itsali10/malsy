"""Shared lesson catalog — single source of truth for admin and student views.

Content lives in:
  - backend/data/books/{book_id}/lessons.json  (titles, order, chapter ids)
  - backend/data/canonical_unitplans/{book_id}/  (section items per lesson)
  - backend/data/listening/                    (listening activities)

Student progress is stored separately in progress_*.json — never mixed here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .language_lesson_sections import (
    LANGUAGE_LESSON_SECTIONS,
    SECTION_COUNT,
    last_part_index,
    uses_language_sections,
)


def parse_chapter_id(chapter_id: str) -> Tuple[str, str]:
    """Return (book_id, short_unit_id) from chapter_id like english_g6:unit_01."""
    raw = (chapter_id or "").strip()
    if ":" in raw:
        book_id, short = raw.split(":", 1)
        return book_id.strip(), short.strip()
    return raw, raw


def part_count_for_book(book_id: str) -> int:
    """Four skill sections for language books; two halves for others."""
    return (last_part_index(book_id) + 1) if book_id else 2


def _lesson_from_catalog(book_id: str, chapter_id: str) -> Optional[Dict[str, Any]]:
    try:
        from .book_lessons_catalog import ensure_lessons_catalog

        catalog = ensure_lessons_catalog(book_id)
    except Exception:
        return None

    for lesson in catalog.get("lessons") or []:
        lid = str(lesson.get("id") or "")
        if lid == chapter_id or lid.endswith(f":{chapter_id.split(':')[-1]}"):
            return {
                "chapter_id": lid,
                "book_id": book_id,
                "unit_id": lesson.get("unit_id"),
                "lesson_number": lesson.get("lessonNumber"),
                "title": lesson.get("title"),
                "description": lesson.get("shortDescription") or "",
                "start_page": lesson.get("start_page"),
                "end_page": lesson.get("end_page"),
                "source": "book_catalog",
            }
    return None


def _lesson_from_history(chapter_id: str, book_id: str) -> Optional[Dict[str, Any]]:
    if "history" not in book_id.lower():
        return None
    try:
        from .history_lessons import get_lesson_by_unit_id

        row = get_lesson_by_unit_id(chapter_id, book_id=book_id)
        if not row:
            return None
        return {
            "chapter_id": chapter_id,
            "book_id": book_id,
            "unit_id": chapter_id.split(":")[-1] if ":" in chapter_id else chapter_id,
            "lesson_number": row.get("lessonNumber"),
            "title": row.get("title"),
            "description": row.get("shortDescription") or "",
            "source": "history_catalog",
        }
    except Exception:
        return None


def resolve_lesson_meta(chapter_id: str) -> Dict[str, Any]:
    """Canonical lesson metadata for admin + student (titles, order, ids)."""
    book_id, _short = parse_chapter_id(chapter_id)

    meta = _lesson_from_catalog(book_id, chapter_id) or _lesson_from_history(chapter_id, book_id)

    if not meta:
        book_key = chapter_id.split(":")[0] if ":" in chapter_id else chapter_id
        try:
            from .portal_curriculum import portal_modules

            for mod in portal_modules():
                if mod["module_key"] == book_key or book_key.startswith(mod["module_key"]):
                    for les in mod.get("lessons") or []:
                        if les.get("chapter_id") == chapter_id:
                            meta = {
                                "chapter_id": chapter_id,
                                "book_id": book_id,
                                "title": les.get("name"),
                                "description": les.get("description") or "",
                                "lesson_number": les.get("id"),
                                "source": "portal_curriculum",
                            }
                            break
                if meta:
                    break
        except Exception:
            pass

    if not meta:
        try:
            from .canonical_plan_store import load_canonical_unit_plan

            plan = load_canonical_unit_plan(book_id, chapter_id)
            if plan and plan.get("unit_title"):
                meta = {
                    "chapter_id": chapter_id,
                    "book_id": book_id,
                    "title": plan.get("unit_title"),
                    "description": "",
                    "source": "canonical_plan",
                }
        except Exception:
            pass

    if not meta:
        meta = {
            "chapter_id": chapter_id,
            "book_id": book_id,
            "title": chapter_id,
            "description": "",
            "source": "fallback",
        }

    meta["part_count"] = part_count_for_book(book_id)
    meta["uses_language_sections"] = uses_language_sections(book_id)
    return meta


def list_book_lessons(book_id: str) -> List[Dict[str, Any]]:
    """Ordered lesson list from lessons.json (same data student catalog API uses)."""
    try:
        from .book_lessons_catalog import ensure_lessons_catalog

        catalog = ensure_lessons_catalog(book_id)
        out: List[Dict[str, Any]] = []
        for lesson in catalog.get("lessons") or []:
            out.append({
                "chapter_id": lesson.get("id"),
                "book_id": book_id,
                "unit_id": lesson.get("unit_id"),
                "lesson_number": lesson.get("lessonNumber"),
                "title": lesson.get("title"),
                "description": lesson.get("shortDescription") or "",
            })
        return out
    except Exception:
        return []


def resolve_next_lesson(chapter_id: str) -> Optional[Dict[str, Any]]:
    """Next lesson in catalog order (same sequence admin and student see)."""
    book_id, _ = parse_chapter_id(chapter_id)
    lessons = list_book_lessons(book_id)
    if not lessons:
        return None

    idx = next((i for i, l in enumerate(lessons) if l.get("chapter_id") == chapter_id), -1)
    if idx < 0:
        short = chapter_id.split(":")[-1]
        idx = next(
            (i for i, l in enumerate(lessons) if str(l.get("unit_id")) == short),
            -1,
        )
    if idx < 0 or idx + 1 >= len(lessons):
        return None

    nxt = lessons[idx + 1]
    return {
        "chapter": nxt["chapter_id"],
        "title": nxt.get("title") or "",
        "description": nxt.get("description") or "",
    }


def lesson_sections_for_chapter(
    chapter_id: str,
    unit_plan: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Four-section structure for language lessons (Reading → Grammar → Listening → Pronunciation)."""
    book_id, _ = parse_chapter_id(chapter_id)
    if not uses_language_sections(book_id):
        return []

    items = (unit_plan or {}).get("items") or []
    from .language_lesson_sections import item_index_for_section

    sections: List[Dict[str, Any]] = []
    for i, sec in enumerate(LANGUAGE_LESSON_SECTIONS):
        item_idx = item_index_for_section(items, i) if items else i
        item = items[item_idx] if items and 0 <= item_idx < len(items) else {}
        sections.append({
            **sec,
            "index": i,
            "item_index": item_idx,
            "item_id": item.get("id"),
            "item_title": item.get("title"),
            "keywords": item.get("keywords") or [],
        })
    return sections


def _build_portal_module(
    book_id: str,
    subject_key: str,
    subject_title: str,
    icon: str,
    lessons_raw: List[Dict[str, Any]],
) -> Dict[str, Any]:
    lessons: List[Dict[str, Any]] = []
    for les in lessons_raw:
        num = int(les.get("lesson_number") or 0)
        lessons.append({
            "id": num,
            "name": les.get("title") or f"Lesson {num}",
            "description": les.get("description") or "",
            "chapter_id": les.get("chapter_id"),
            "book_unit_id": les.get("chapter_id"),
        })
    return {
        "subject_key": subject_key,
        "subject_title": subject_title,
        "module_key": book_id,
        "module_title": subject_title,
        "icon": icon,
        "lessons": lessons,
        "source": "book_catalog",
        "book_id": book_id,
    }


def book_module_for_portal(
    book_id: str,
    subject_key: str,
    subject_title: str,
    icon: str = "📖",
) -> Optional[Dict[str, Any]]:
    """One subject module from uploaded book catalog (same as GET /books/{id}/lessons)."""
    lessons_raw = list_book_lessons(book_id)
    if not lessons_raw:
        return None
    return _build_portal_module(book_id, subject_key, subject_title, icon, lessons_raw)


def english_book_module_for_portal() -> Optional[Dict[str, Any]]:
    """Single English module from uploaded book catalog (matches student LinearView)."""
    from .book_registry import get_primary_book

    rec = get_primary_book("english")
    book_id = (rec or {}).get("book_id") or "english_g6"
    return book_module_for_portal(book_id, "english", "English", "📖")


def portal_modules_from_books(grade: int = 6) -> List[Dict[str, Any]]:
    """All primary-book modules — same lesson lists students see via /books/{id}/lessons."""
    from .book_registry import get_primary_book
    from .subject_registry import get_subject_record

    modules: List[Dict[str, Any]] = []
    for subject_key in ("english", "science", "history"):
        rec = get_primary_book(subject_key, grade=grade)
        book_id = (rec or {}).get("book_id")
        if not book_id:
            continue
        subj_rec = get_subject_record(subject_key) or {}
        title = str(subj_rec.get("subject_name") or subject_key.replace("_", " ").title())
        icon = str(subj_rec.get("icon") or "📖")
        mod = book_module_for_portal(book_id, subject_key, title, icon)
        if mod:
            modules.append(mod)
    return modules


def first_lesson_chapter_for_book(book_id: str) -> Optional[str]:
    lessons = list_book_lessons(book_id)
    if not lessons:
        return None
    return str(lessons[0].get("chapter_id") or "")


def first_lesson_chapter_for_subject(subject_key: str, grade: int = 6) -> Optional[str]:
    from .book_registry import get_primary_book

    rec = get_primary_book(subject_key, grade=grade)
    book_id = (rec or {}).get("book_id")
    if not book_id:
        return None
    return first_lesson_chapter_for_book(book_id)


def modules_for_enrolled_subjects(
    enrolled_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Portal modules for a student's enrolled subjects only (same book catalogs as students)."""
    modules: List[Dict[str, Any]] = []
    seen: set = set()
    for row in enrolled_rows:
        subject_key = str(row.get("subject_key") or "")
        if not subject_key or subject_key in seen:
            continue
        seen.add(subject_key)
        book_id = row.get("primary_book_id")
        if not book_id:
            continue
        mod = book_module_for_portal(
            str(book_id),
            subject_key,
            str(row.get("subject_name") or subject_key.replace("_", " ").title()),
            str(row.get("icon") or "📖"),
        )
        if mod:
            modules.append(mod)
    return modules
