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

def _plan_key(chapter_id: str) -> str:
    # Windows doesn't allow colons in filenames, so replace with underscore
    safe_id = chapter_id.replace(":", "_")
    return f"plan_{safe_id}.json"

def _progress_key(student_id: str) -> str:
    return f"progress_{student_id}.json"

def get_or_create_plan(chapter_id: str) -> Dict[str, Any]:
    plan = load_json(_plan_key(chapter_id), default=None)
    if plan is None:
        plan = build_chapter_plan(chapter_id)
        save_json(_plan_key(chapter_id), plan)
    return plan

def load_progress(student_id: str) -> Dict[str, Any]:
    return load_json(_progress_key(student_id), default={
        "student_id": student_id,
        "chapter_id": None,
        "unit_index": 0,
        "unit_part": 0  # 0 = first half, 1 = second half
    })

def save_progress(student_id: str, chapter_id: str, unit_index: int, unit_part: int = 0) -> None:
    save_json(_progress_key(student_id), {
        "student_id": student_id,
        "chapter_id": chapter_id,
        "unit_index": unit_index,
        "unit_part": unit_part  # 0 = first half (pages 1-5), 1 = second half (pages 6-10)
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
