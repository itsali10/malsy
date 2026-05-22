from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import load_json, save_json


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _exam_key(student_id: str, exam_id: str) -> str:
    return f"exam_{student_id}_{exam_id}.json"


def _exam_index_key(student_id: str) -> str:
    return f"exams_{student_id}.json"


def list_exam_ids(student_id: str) -> List[str]:
    data = load_json(_exam_index_key(student_id), default={"student_id": student_id, "exam_ids": []})
    ids = data.get("exam_ids", [])
    return [str(x) for x in ids] if isinstance(ids, list) else []


def _save_exam_id(student_id: str, exam_id: str) -> None:
    data = load_json(_exam_index_key(student_id), default={"student_id": student_id, "exam_ids": []})
    ids = data.get("exam_ids", [])
    if not isinstance(ids, list):
        ids = []
    if exam_id not in ids:
        ids.append(exam_id)
    data["exam_ids"] = ids
    save_json(_exam_index_key(student_id), data)


def create_exam(
    *,
    student_id: str,
    exam_id: str,
    exam_type: str,
    unit_ids: List[str],
    questions: List[Dict[str, Any]],
    course_week: Optional[int] = None,
    course_month: Optional[int] = None,
) -> Dict[str, Any]:
    exam: Dict[str, Any] = {
        "exam_id": exam_id,
        "student_id": student_id,
        "exam_type": exam_type,  # weekly_unit | monthly_cumulative
        "course_week": course_week,
        "course_month": course_month,
        "unit_ids": unit_ids,
        "questions": questions,
        "attempts": [],
        "status": "in_progress",
        "current_question_index": 0,
        "created_at": _now_iso(),
        "finished_at": None,
        "score": {
            "total": 0.0,
            "max": float(len(questions)),
            "percent": 0.0,
            "by_unit": {},
        },
        "summary": None,
    }
    save_exam(exam)
    return exam


def load_exam(student_id: str, exam_id: str) -> Optional[Dict[str, Any]]:
    return load_json(_exam_key(student_id, exam_id), default=None)


def save_exam(exam: Dict[str, Any]) -> None:
    student_id = str(exam.get("student_id", ""))
    exam_id = str(exam.get("exam_id", ""))
    if not student_id or not exam_id:
        raise ValueError("exam must include student_id and exam_id")
    save_json(_exam_key(student_id, exam_id), exam)
    _save_exam_id(student_id, exam_id)

