"""Student continue-learning resume — reads progress only, never lesson content."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .language_lesson_sections import (
    LANGUAGE_LESSON_SECTIONS,
    SECTION_COUNT,
    last_part_index,
    lesson_progress_percent,
    section_title_for_index,
    uses_language_sections,
)
from .lesson_catalog_service import list_book_lessons, resolve_lesson_meta
from .session_engine import (
    is_lesson_unlocked,
    load_book_lesson_progress,
    load_progress,
    progress_matches_book,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _section_completed(i: int, unit_part: int, max_unlocked_part: int) -> bool:
    """Section i is done if the student passed its quiz (unlocked next) or moved past it."""
    return i < unit_part or i < max_unlocked_part


def _section_statuses(
    unit_part: int,
    max_unlocked_part: int,
    part_count: int,
    *,
    is_language: bool,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for i in range(part_count):
        if is_language and i < len(LANGUAGE_LESSON_SECTIONS):
            sec = LANGUAGE_LESSON_SECTIONS[i]
            title = sec.get("title") or section_title_for_index(i)
            key = sec.get("key") or f"section_{i}"
        else:
            title = f"Part {i + 1}"
            key = f"part_{i}"
        completed = _section_completed(i, unit_part, max_unlocked_part)
        out.append({
            "index": i,
            "key": key,
            "title": title,
            "completed": completed,
            "active": i == unit_part and not completed,
        })
    return out


def _lesson_progress_pct(
    unit_part: int,
    max_unlocked_part: int,
    part_count: int,
    *,
    is_language: bool,
) -> int:
    if part_count <= 0:
        return 0
    if is_language and part_count == SECTION_COUNT:
        return lesson_progress_percent(unit_part, max_unlocked_part)
    done = sum(1 for i in range(part_count) if _section_completed(i, unit_part, max_unlocked_part))
    return min(100, int(round((done / part_count) * 100)))


def resume_section_index(unit_part: int, max_unlocked_part: int, part_count: int) -> int:
    """Open the section where the student should continue."""
    last = max(0, part_count - 1)
    # After passing a section quiz, next section is unlocked but unit_part may still be on the old one.
    if max_unlocked_part > unit_part:
        return min(max_unlocked_part, last)
    return min(max(0, unit_part), last)


def resolve_subject_resume(
    student_id: str,
    subject_key: str,
    subject_name: str,
    primary_book_id: Optional[str],
) -> Dict[str, Any]:
    """Resume point for one enrolled subject."""
    base: Dict[str, Any] = {
        "subject_key": subject_key,
        "subject_name": subject_name,
        "book_id": primary_book_id,
        "unlocked": bool(primary_book_id),
        "locked": False,
        "chapter_id": None,
        "lesson_title": None,
        "lesson_number": None,
        "unit_part": 0,
        "section_title": None,
        "progress_percent": 0,
        "section_statuses": [],
        "updated_at": None,
        "continue_available": False,
    }

    if not primary_book_id:
        base["locked"] = True
        return base

    lessons = list_book_lessons(primary_book_id)
    if not lessons:
        base["locked"] = True
        return base

    global_prog = load_progress(student_id)
    book_prog = load_book_lesson_progress(student_id, primary_book_id)
    completed_numbers = set(int(x) for x in (book_prog.get("completed_lesson_numbers") or []))
    max_unlocked_lesson_idx = int(book_prog.get("max_unlocked_lesson_index", 0))

    part_count = last_part_index(primary_book_id) + 1
    is_language = uses_language_sections(primary_book_id)

    # Pick lesson index: saved cursor or first incomplete unlocked lesson.
    lesson_idx = 0
    if progress_matches_book(global_prog.get("chapter_id"), primary_book_id):
        lesson_idx = max(0, min(int(global_prog.get("unit_index", 0)), len(lessons) - 1))
    else:
        for i, les in enumerate(lessons):
            num = int(les.get("lesson_number") or (i + 1))
            if num not in completed_numbers:
                lesson_idx = i
                break

    lesson = lessons[lesson_idx]
    lesson_num = int(lesson.get("lesson_number") or (lesson_idx + 1))
    chapter_id = str(lesson.get("chapter_id") or "")

    # Fully completed lesson → next unlocked lesson, section Reading.
    if lesson_num in completed_numbers:
        next_idx = lesson_idx + 1
        if next_idx < len(lessons) and next_idx <= max_unlocked_lesson_idx:
            lesson_idx = next_idx
            lesson = lessons[lesson_idx]
            lesson_num = int(lesson.get("lesson_number") or (lesson_idx + 1))
            chapter_id = str(lesson.get("chapter_id") or "")
        elif next_idx < len(lessons):
            base.update({
                "locked": True,
                "lesson_title": lessons[next_idx].get("title"),
                "lesson_number": int(lessons[next_idx].get("lesson_number") or (next_idx + 1)),
                "chapter_id": lessons[next_idx].get("chapter_id"),
            })
            return base

    if not is_lesson_unlocked(student_id, primary_book_id, lesson_num):
        base["locked"] = True
        base["lesson_title"] = lesson.get("title")
        base["lesson_number"] = lesson_num
        base["chapter_id"] = chapter_id
        return base

    unit_part = 0
    max_unlocked_part = 0
    if progress_matches_book(global_prog.get("chapter_id"), primary_book_id):
        if int(global_prog.get("unit_index", -1)) == lesson_idx:
            unit_part = int(global_prog.get("unit_part", 0))
            max_unlocked_part = int(global_prog.get("max_unlocked_part", 0))

    resume_part = resume_section_index(unit_part, max_unlocked_part, part_count)
    if is_language:
        section_title = section_title_for_index(resume_part)
    else:
        section_title = f"Part {resume_part + 1}"

    meta = resolve_lesson_meta(chapter_id)
    lesson_title = meta.get("title") or lesson.get("title") or f"Lesson {lesson_num}"
    statuses = _section_statuses(resume_part, max_unlocked_part, part_count, is_language=is_language)
    pct = _lesson_progress_pct(resume_part, max_unlocked_part, part_count, is_language=is_language)

    updated_at = global_prog.get("updated_at")
    if progress_matches_book(global_prog.get("chapter_id"), primary_book_id):
        if int(global_prog.get("unit_index", -1)) == lesson_idx:
            updated_at = global_prog.get("updated_at") or updated_at

    base.update({
        "unlocked": True,
        "locked": False,
        "chapter_id": chapter_id,
        "lesson_title": lesson_title,
        "lesson_number": lesson_num,
        "unit_part": resume_part,
        "section_title": section_title,
        "progress_percent": pct,
        "section_statuses": statuses,
        "updated_at": updated_at,
        "continue_available": True,
    })
    return base


def get_continue_learning_for_student(
    student_id: str,
    portal_subjects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Resume cards for dashboard — one entry per enrolled subject."""
    subjects: List[Dict[str, Any]] = []
    primary: Optional[Dict[str, Any]] = None
    latest_ts: Optional[str] = None

    for row in portal_subjects:
        resume = resolve_subject_resume(
            student_id,
            str(row.get("subject_key") or ""),
            str(row.get("subject_name") or ""),
            row.get("primary_book_id"),
        )
        resume["subject_id"] = str(row.get("subject_id") or "")
        resume["icon"] = row.get("icon")
        resume["available_lessons_count"] = int(row.get("available_lessons_count") or 0)
        subjects.append(resume)

        ts = resume.get("updated_at")
        if resume.get("continue_available") and ts:
            if latest_ts is None or ts > latest_ts:
                latest_ts = ts
                primary = resume
        elif primary is None and resume.get("continue_available"):
            primary = resume

    if primary is None:
        for r in subjects:
            if r.get("continue_available"):
                primary = r
                break

    return {
        "student_id": student_id,
        "subjects": subjects,
        "primary": primary,
    }
