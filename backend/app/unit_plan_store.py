from typing import Any, Dict, Optional
from .storage import load_json, save_json

def _plan_key(student_id: str, chapter_id: str) -> str:
    safe = chapter_id.replace(":", "_")
    return f"unitplan_{student_id}_{safe}.json"

def load_unit_plan(student_id: str, chapter_id: str) -> Optional[Dict[str, Any]]:
    return load_json(_plan_key(student_id, chapter_id), default=None)

def save_unit_plan(student_id: str, chapter_id: str, plan: Dict[str, Any]) -> None:
    save_json(_plan_key(student_id, chapter_id), plan)
