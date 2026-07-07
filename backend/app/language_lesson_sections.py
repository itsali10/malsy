"""Four-section language lesson model: Reading → Grammar → Listening → Pronunciation."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Ordered sections for every language lesson (same lesson id / title).
LANGUAGE_LESSON_SECTIONS: List[Dict[str, str]] = [
    {"key": "reading", "type": "reading", "title": "Reading", "icon": "📖"},
    {"key": "grammar", "type": "grammar", "title": "Grammar", "icon": "✏"},
    {"key": "listening", "type": "listening", "title": "Listening", "icon": "🎧"},
    {"key": "pronunciation", "type": "speaking", "title": "Pronunciation", "icon": "🗣"},
]

SECTION_COUNT = len(LANGUAGE_LESSON_SECTIONS)
LAST_SECTION_INDEX = SECTION_COUNT - 1

# Legacy two-part books (science, etc.) still use halves.
LEGACY_PART_COUNT = 2
LEGACY_LAST_PART_INDEX = 1


def part_page_range(start_page: int, end_page: int, unit_part: int) -> tuple[int, int]:
    """
    Split one lesson's inclusive page range into two teaching halves.
    Part 0 = first half; Part 1 = remainder (covers every page exactly once).
    """
    start = int(start_page)
    end = int(end_page)
    if start <= 0 or end < start:
        return start, end
    total = end - start + 1
    half = total // 2
    if int(unit_part) <= 0:
        return start, start + half - 1
    return start + half, end


def chunk_pdf_page(chunk: Dict[str, Any]) -> Optional[int]:
    """Resolve a chunk's 1-based book page from metadata or chunk id (e.g. …:p7:c0)."""
    meta = chunk.get("meta") or {}
    # book_page is canonical (1-based); pdf_page may be 0-based in some ingests.
    page = meta.get("book_page")
    if page is not None:
        try:
            book = int(page)
            if book > 0:
                return book
        except (TypeError, ValueError):
            pass
    page = meta.get("pdf_page")
    if page is not None and int(page) > 0:
        return int(page)
    cid = str(meta.get("chunk_id") or "")
    m = re.search(r":p(\d+):", cid)
    if m:
        return int(m.group(1))
    return None


def uses_language_sections(book_id: str) -> bool:
    """True when unit_part indexes skill sections (Reading…Pronunciation), not page halves."""
    from .subject_registry import is_language_subject

    key = (book_id or "").split(":")[0].lower()
    if not key:
        return False
    subject = key.split("_")[0] if "_" in key else key
    return is_language_subject(subject)


def last_part_index(book_id: str) -> int:
    return LAST_SECTION_INDEX if uses_language_sections(book_id) else LEGACY_LAST_PART_INDEX


def clamp_part_index(book_id: str, part: int) -> int:
    return max(0, min(last_part_index(book_id), int(part)))


def section_def(section_index: int) -> Dict[str, str]:
    i = max(0, min(LAST_SECTION_INDEX, int(section_index)))
    return LANGUAGE_LESSON_SECTIONS[i]


def section_type_for_index(section_index: int) -> str:
    return section_def(section_index)["type"]


def section_title_for_index(section_index: int) -> str:
    return section_def(section_index)["title"]


def section_key_for_index(section_index: int) -> str:
    return section_def(section_index)["key"]


def item_index_for_section(items: List[Dict[str, Any]], section_index: int) -> int:
    """First unit-plan item index matching this section's skill type."""
    target = section_type_for_index(section_index)
    target_key = section_key_for_index(section_index)

    for i, item in enumerate(items):
        itype = (item.get("type") or "").lower()
        iid = (item.get("id") or "").lower()
        if itype == target:
            return i
        if target_key in iid or iid.startswith(target):
            return i

    # Fallback: pronunciation may be stored as speaking/pronunciation ids
    if target == "speaking":
        for i, item in enumerate(items):
            itype = (item.get("type") or "").lower()
            iid = (item.get("id") or "").lower()
            if itype in {"speaking", "pronunciation"} or "speak" in iid or "pronun" in iid:
                return i

    return min(section_index, max(0, len(items) - 1))


def filter_chunks_for_section(chunks: List[Dict[str, Any]], section_type: str) -> List[Dict[str, Any]]:
    """Keep chunks belonging to a textbook section (reading, grammar, …)."""
    if not chunks or not section_type:
        return []

    from .english_section_segmentation import chunks_for_teaching_section

    return chunks_for_teaching_section(chunks, section_type.lower())


def section_statuses(unit_part: int, max_unlocked: int) -> List[Dict[str, Any]]:
    """Build completion UI metadata for each section."""
    statuses: List[Dict[str, Any]] = []
    for i, sec in enumerate(LANGUAGE_LESSON_SECTIONS):
        completed = i < unit_part
        active = i == unit_part
        unlocked = i <= max_unlocked
        statuses.append({
            **sec,
            "index": i,
            "completed": completed,
            "active": active,
            "unlocked": unlocked,
            "locked": not unlocked,
        })
    return statuses


def lesson_progress_percent(unit_part: int, max_unlocked: int) -> int:
    """Percent complete based on finished sections (all four required)."""
    done = 0
    for i in range(SECTION_COUNT):
        if i < unit_part:
            done += 1
    # Current section in progress counts as half a step visually
    return min(100, int(round((done / SECTION_COUNT) * 100)))


def seed_section_progress(
    student_id: str,
    chapter_id: str,
    section_index: int,
    items: List[Dict[str, Any]],
) -> int:
    """Point unit progress at the first item for this section."""
    from .progress_store import load_unit_progress, save_unit_progress

    idx = item_index_for_section(items, section_index)
    progress = load_unit_progress(student_id, chapter_id)
    progress["current_item_index"] = idx
    progress["hint_count"] = 0
    progress["last_quiz"] = None
    save_unit_progress(student_id, chapter_id, progress)
    return idx
