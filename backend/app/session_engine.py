from typing import Dict, Any, List, Tuple, Optional
from .storage import load_json, save_json
from .lesson_planner import build_chapter_plan

UNITS_PER_SESSION = 1  # One plan unit per API session; duration = session_config.SESSION_UNIT_MINUTES


def progress_book_id(chapter_id: str) -> str:
    """Book key for progress JSON (e.g. english_g6:unit_01 -> english_g6)."""
    if ":" in chapter_id:
        return chapter_id.split(":")[0]
    return chapter_id


def progress_matches_book(stored: Optional[str], book_id: str) -> bool:
    """True if saved progress row belongs to this book (supports legacy full unit ids)."""
    if not stored:
        return False
    if stored == book_id:
        return True
    if ":" in stored:
        return stored.split(":")[0] == book_id
    return False


def plan_index_for_real_unit(plan: Dict[str, Any], real_unit_id: str) -> Optional[int]:
    """Index of a unit in the book plan, or None if not found."""
    short = real_unit_id.split(":")[-1] if ":" in real_unit_id else real_unit_id
    for i, u in enumerate(plan.get("units") or []):
        if (u.get("real_unit_id") or "") == real_unit_id:
            return i
        if (u.get("unit_id") or "") == short:
            return i
    return None

def _plan_key(chapter_id: str, lesson_title: str = "") -> str:
    # Windows doesn't allow colons in filenames, so replace with underscore
    safe_id = chapter_id.replace(":", "_")
    if lesson_title:
        safe_title = lesson_title.lower().replace(" ", "_")[:32]
        return f"plan_{safe_id}_{safe_title}.json"
    return f"plan_{safe_id}.json"

def _progress_key(student_id: str) -> str:
    return f"progress_{student_id}.json"

def get_or_create_plan(chapter_id: str, lesson_title: str = "", lesson_description: str = "") -> Dict[str, Any]:
    key = _plan_key(chapter_id, lesson_title)
    plan = load_json(key, default=None)
    if plan is None:
        plan = build_chapter_plan(chapter_id, lesson_title=lesson_title, lesson_description=lesson_description)
        save_json(key, plan)
    return plan

def load_progress(student_id: str) -> Dict[str, Any]:
    return load_json(_progress_key(student_id), default={
        "student_id": student_id,
        "chapter_id": None,
        "unit_index": 0,
        "unit_part": 0,
        "max_unlocked_part": 0,
    })

def save_progress(
    student_id: str,
    chapter_id: str,
    unit_index: int,
    unit_part: int = 0,
    *,
    max_unlocked_part: Optional[int] = None,
) -> None:
    existing = load_progress(student_id)
    same_unit = int(existing.get("unit_index", -1)) == int(unit_index)
    existing_max = int(existing.get("max_unlocked_part", 0)) if same_unit else 0
    if max_unlocked_part is None:
        max_unlocked_part = existing_max
    # Monotonic per unit: once a part is unlocked for this unit, it can never re-lock.
    # Only moving to a different unit (same_unit == False) resets the unlock state.
    if same_unit:
        max_unlocked_part = max(int(max_unlocked_part), existing_max)
    save_json(_progress_key(student_id), {
        "student_id": student_id,
        "chapter_id": chapter_id,
        "unit_index": unit_index,
        "unit_part": unit_part,
        "max_unlocked_part": max(0, min(1, int(max_unlocked_part))),
    })

def select_units_for_session(plan: Dict[str, Any], start_index: int) -> Tuple[List[Dict[str, Any]], int]:
    units = plan.get("units", [])
    chosen = units[start_index:start_index + UNITS_PER_SESSION]
    next_index = start_index + len(chosen)
    return chosen, next_index

def reset_progress(student_id: str) -> None:
    # set to no chapter and 0 index
    save_json(_progress_key(student_id), {
        "student_id": student_id,
        "chapter_id": None,
        "unit_index": 0
    })


def _book_lesson_progress_key(student_id: str, book_id: str) -> str:
    safe_book = book_id.replace(":", "_")
    return f"progress_{student_id}_{safe_book}.json"


def load_book_lesson_progress(student_id: str, book_id: str) -> Dict[str, Any]:
    """Per-book sequential lesson unlock (History G6: lesson 1 unlocks lesson 2, etc.)."""
    return load_json(_book_lesson_progress_key(student_id, book_id), default={
        "student_id": student_id,
        "book_id": book_id,
        "max_unlocked_lesson_index": 0,
        "completed_lesson_numbers": [],
    })


def save_book_lesson_progress(student_id: str, book_id: str, data: Dict[str, Any]) -> None:
    save_json(_book_lesson_progress_key(student_id, book_id), data)


def is_lesson_unlocked(student_id: str, book_id: str, lesson_number: int) -> bool:
    """Lesson 1 is always unlocked (index 0). Passing lesson N unlocks lesson N+1."""
    idx = int(lesson_number) - 1
    prog = load_book_lesson_progress(student_id, book_id)
    return idx <= int(prog.get("max_unlocked_lesson_index", 0))


def record_lesson_passed(student_id: str, book_id: str, lesson_number: int) -> Dict[str, Any]:
    """Mark a lesson MCQ passed and monotonically unlock the next lesson."""
    prog = load_book_lesson_progress(student_id, book_id)
    ln = int(lesson_number)
    completed = list(prog.get("completed_lesson_numbers") or [])
    if ln not in completed:
        completed.append(ln)
        completed.sort()
    current_max = int(prog.get("max_unlocked_lesson_index", 0))
    # Passing lesson N (1-based) unlocks lesson N+1 → index N.
    new_max = max(current_max, ln)
    prog["completed_lesson_numbers"] = completed
    prog["max_unlocked_lesson_index"] = new_max
    save_book_lesson_progress(student_id, book_id, prog)
    return prog
