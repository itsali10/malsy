"""Schedule session availability — same progression rules as student_resume_service."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .language_lesson_sections import (
    LANGUAGE_LESSON_SECTIONS,
    last_part_index,
    uses_language_sections,
)
from .lesson_catalog_service import list_book_lessons, parse_chapter_id
from .session_engine import (
    is_lesson_unlocked,
    load_book_lesson_progress,
    load_progress,
    progress_matches_book,
)
from .student_resume_service import resume_section_index


def _find_lesson_index(lessons: List[Dict[str, Any]], lesson_id: str) -> Optional[int]:
    norm = (lesson_id or "").strip()
    if not norm:
        return None
    short = norm.split(":")[-1] if ":" in norm else norm
    for i, les in enumerate(lessons):
        cid = str(les.get("chapter_id") or "")
        if cid == norm:
            return i
        uid = str(les.get("unit_id") or "")
        if uid and uid == short:
            return i
    return None


def _section_completed(i: int, unit_part: int, max_unlocked_part: int) -> bool:
    return i < unit_part or i < max_unlocked_part


def _incomplete_section_titles(
    unit_part: int,
    max_unlocked_part: int,
    part_count: int,
    *,
    is_language: bool,
) -> List[str]:
    out: List[str] = []
    for i in range(part_count):
        if _section_completed(i, unit_part, max_unlocked_part):
            continue
        if is_language and i < len(LANGUAGE_LESSON_SECTIONS):
            out.append(LANGUAGE_LESSON_SECTIONS[i]["title"])
        else:
            out.append(f"Part {i + 1}")
    return out


def _format_section_lock_message(incomplete: List[str], prev_title: str) -> str:
    if not incomplete:
        return f'Complete "{prev_title}" before continuing.'
    if len(incomplete) == 1:
        return f"Finish {incomplete[0]} from {prev_title} to continue."
    if len(incomplete) == 2:
        return f"Finish {incomplete[0]} and {incomplete[1]} from {prev_title} to continue."
    joined = ", ".join(incomplete[:-1]) + f", and {incomplete[-1]}"
    return f"Finish {joined} from {prev_title} to continue."


def _progress_on_lesson(
    student_id: str,
    book_id: str,
    lesson_idx: int,
) -> Tuple[int, int]:
    """Return (unit_part, max_unlocked_part) when cursor is on this lesson index."""
    prog = load_progress(student_id)
    if not progress_matches_book(prog.get("chapter_id"), book_id):
        return 0, 0
    if int(prog.get("unit_index", -1)) != lesson_idx:
        return 0, 0
    return int(prog.get("unit_part", 0)), int(prog.get("max_unlocked_part", 0))


def evaluate_schedule_session(
    student_id: str,
    lesson_id: str,
    lesson_title: str,
) -> Dict[str, Any]:
    """
    Determine effective schedule status using book lesson unlock + section progress.
    Matches student_resume_service / session_engine — not the schedule unlock chain.
    """
    book_id, _ = parse_chapter_id(lesson_id)
    lessons = list_book_lessons(book_id)
    lesson_idx = _find_lesson_index(lessons, lesson_id)

    base: Dict[str, Any] = {
        "status": "locked",
        "lock_reason": "This lesson is not available yet.",
        "action_label": "Locked",
        "unit_part": 0,
        "continue_available": False,
    }

    if lesson_idx is None or not lessons:
        return base

    lesson = lessons[lesson_idx]
    lesson_num = int(lesson.get("lesson_number") or (lesson_idx + 1))
    title = (lesson_title or lesson.get("title") or f"Lesson {lesson_num}").strip()
    chapter_id = str(lesson.get("chapter_id") or lesson_id)

    book_prog = load_book_lesson_progress(student_id, book_id)
    completed_numbers = {int(x) for x in (book_prog.get("completed_lesson_numbers") or [])}

    part_count = last_part_index(book_id) + 1
    is_language = uses_language_sections(book_id)

    if lesson_num in completed_numbers:
        return {
            "status": "completed",
            "lock_reason": None,
            "action_label": "Completed",
            "unit_part": 0,
            "continue_available": False,
        }

    if not is_lesson_unlocked(student_id, book_id, lesson_num):
        prev_idx = lesson_idx - 1
        if prev_idx >= 0:
            prev = lessons[prev_idx]
            prev_title = str(prev.get("title") or f"Lesson {lesson_num - 1}")
            prev_num = int(prev.get("lesson_number") or (prev_idx + 1))
            unit_part, max_unlocked = _progress_on_lesson(student_id, book_id, prev_idx)
            prog = load_progress(student_id)
            in_progress_on_prev = (
                progress_matches_book(prog.get("chapter_id"), book_id)
                and int(prog.get("unit_index", -1)) == prev_idx
            )
            incomplete = _incomplete_section_titles(
                unit_part, max_unlocked, part_count, is_language=is_language
            )
            if in_progress_on_prev and incomplete:
                lock_reason = _format_section_lock_message(incomplete, prev_title)
            else:
                lock_reason = f'Complete "{prev_title}" before starting "{title}".'
        else:
            lock_reason = "Finish the previous lesson to unlock today's lesson."
        return {
            "status": "locked",
            "lock_reason": lock_reason,
            "action_label": "Locked",
            "unit_part": 0,
            "continue_available": False,
        }

    unit_part, max_unlocked = _progress_on_lesson(student_id, book_id, lesson_idx)
    resume_part = resume_section_index(unit_part, max_unlocked, part_count)
    prog = load_progress(student_id)
    in_progress = (
        progress_matches_book(prog.get("chapter_id"), book_id)
        and int(prog.get("unit_index", -1)) == lesson_idx
    )
    action_label = "Continue Lesson" if in_progress else "Start Lesson"

    return {
        "status": "available",
        "lock_reason": None,
        "action_label": action_label,
        "unit_part": resume_part,
        "continue_available": True,
        "chapter_id": chapter_id,
    }
