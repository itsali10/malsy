from typing import Any, Dict
from .storage import load_json, save_json

def _progress_key(student_id: str, chapter_id: str) -> str:
    safe = chapter_id.replace(":", "_")
    return f"progress_{student_id}_{safe}.json"

def load_unit_progress(student_id: str, chapter_id: str) -> Dict[str, Any]:
    return load_json(_progress_key(student_id, chapter_id), default={
        "student_id": student_id,
        "chapter_id": chapter_id,
        "current_item_index": 0,
        "done_items": [],
        "last_quiz": None,
        "hint_count": 0,  # Track hint attempts (0, 1, or 2)
        "attempt_history": []  # Recent quiz attempts for evaluation
    })

def save_unit_progress(student_id: str, chapter_id: str, progress: Dict[str, Any]) -> None:
    save_json(_progress_key(student_id, chapter_id), progress)

def reset_unit_progress(student_id: str, chapter_id: str) -> None:
    existing = load_unit_progress(student_id, chapter_id)
    attempt_history = existing.get("attempt_history", [])
    if not isinstance(attempt_history, list):
        attempt_history = []
    save_unit_progress(student_id, chapter_id, {
        "student_id": student_id,
        "chapter_id": chapter_id,
        "current_item_index": 0,
        "done_items": [],
        "last_quiz": None,
        "hint_count": 0,
        # Preserve attempt history across unit parts (part1 -> part2)
        "attempt_history": attempt_history
    })
