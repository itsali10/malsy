from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .exam_store import list_exam_ids, load_exam
from .progress_store import load_unit_progress
from .student_timeline_store import (
    ensure_student_start,
    course_week_month,
    units_in_course_month,
    units_in_course_week,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _collect_exam_summaries(student_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for exam_id in list_exam_ids(student_id):
        exam = load_exam(student_id, exam_id)
        if not exam:
            continue
        score = exam.get("score") or {}
        out.append(
            {
                "exam_id": exam.get("exam_id"),
                "exam_type": exam.get("exam_type"),
                "course_week": exam.get("course_week"),
                "course_month": exam.get("course_month"),
                "unit_ids": exam.get("unit_ids", []),
                "status": exam.get("status"),
                "percent": _safe_float(score.get("percent", 0.0)),
                "total": _safe_float(score.get("total", 0.0)),
                "max": _safe_float(score.get("max", 0.0)),
                "finished_at": exam.get("finished_at"),
                "created_at": exam.get("created_at"),
            }
        )
    return out


def _interaction_stats_for_units(student_id: str, unit_ids: List[str]) -> Dict[str, Any]:
    attempts = 0
    correct = 0
    remediation_used = 0
    by_unit: Dict[str, Any] = {}

    for uid in unit_ids:
        p = load_unit_progress(student_id, uid)
        hist = p.get("attempt_history", [])
        if not isinstance(hist, list):
            hist = []
        unit_attempts = 0
        unit_correct = 0
        unit_rem = 0
        for a in hist:
            if not isinstance(a, dict):
                continue
            unit_attempts += 1
            if a.get("correct"):
                unit_correct += 1
            if a.get("remediation_used"):
                unit_rem += 1
        attempts += unit_attempts
        correct += unit_correct
        remediation_used += unit_rem
        by_unit[uid] = {
            "attempts": unit_attempts,
            "correct": unit_correct,
            "accuracy": round((unit_correct / unit_attempts) * 100.0, 2) if unit_attempts else None,
            "remediation_used": unit_rem,
        }

    accuracy = round((correct / attempts) * 100.0, 2) if attempts else None
    return {
        "attempts": attempts,
        "correct": correct,
        "accuracy": accuracy,
        "remediation_used": remediation_used,
        "by_unit": by_unit,
    }


def weekly_evaluation(student_id: str, week: Optional[int] = None) -> Dict[str, Any]:
    timeline = ensure_student_start(student_id)
    current_week, current_month = course_week_month(timeline)
    target_week = int(week or current_week)

    unit_recs = units_in_course_week(timeline, target_week)
    unit_ids = [r.get("unit_id") for r in unit_recs if r.get("unit_id")]

    exams = _collect_exam_summaries(student_id)
    weekly_exams = [e for e in exams if e.get("exam_type") == "weekly_unit" and int(e.get("course_week") or 0) == target_week]
    finished = [e for e in weekly_exams if e.get("status") == "finished"]

    avg = round(sum(e.get("percent", 0.0) for e in finished) / len(finished), 2) if finished else None
    weak_units: List[str] = []
    for e in finished:
        if e.get("percent", 0.0) < 70.0:
            for uid in e.get("unit_ids", []) or []:
                if uid and uid not in weak_units:
                    weak_units.append(uid)

    interaction = _interaction_stats_for_units(student_id, unit_ids)

    recommendations: List[str] = []
    if unit_ids and not finished:
        recommendations.append("Take the weekly exam for each completed unit to check understanding.")
    if avg is not None and avg < 70.0:
        recommendations.append("Review the weak units, then retake the weekly exam.")
    if interaction.get("remediation_used", 0) >= 1:
        recommendations.append("Spend extra time on concepts that required re-explanations (remediation).")
    if not recommendations:
        recommendations.append("Keep going! Continue the next unit and take the weekly exam when you finish.")

    return {
        "student_id": student_id,
        "generated_at": _now_iso(),
        "course_week": target_week,
        "course_month_now": current_month,
        "units_completed": unit_ids,
        "weekly_exams": weekly_exams,
        "weekly_average_percent": avg,
        "weak_units": weak_units,
        "interaction": interaction,
        "recommendations": recommendations,
    }


def monthly_evaluation(student_id: str, month: Optional[int] = None) -> Dict[str, Any]:
    timeline = ensure_student_start(student_id)
    current_week, current_month = course_week_month(timeline)
    target_month = int(month or current_month)

    unit_recs = units_in_course_month(timeline, target_month)
    unit_ids = [r.get("unit_id") for r in unit_recs if r.get("unit_id")]

    exams = _collect_exam_summaries(student_id)
    monthly_exams = [e for e in exams if e.get("exam_type") == "monthly_cumulative" and int(e.get("course_month") or 0) == target_month]
    finished = [e for e in monthly_exams if e.get("status") == "finished"]
    avg = round(sum(e.get("percent", 0.0) for e in finished) / len(finished), 2) if finished else None

    interaction = _interaction_stats_for_units(student_id, unit_ids)

    recommendations: List[str] = []
    if unit_ids and not finished:
        recommendations.append("Take the monthly exam to review everything learned this month.")
    if avg is not None and avg < 70.0:
        recommendations.append("Make a review plan: revisit each unit with low accuracy and redo practice exercises.")
    if interaction.get("attempts", 0) == 0 and unit_ids:
        recommendations.append("Answer more in-session questions to build stronger mastery before the monthly exam.")
    if not recommendations:
        recommendations.append("Great progress this month. Keep learning and maintain a steady weekly exam routine.")

    return {
        "student_id": student_id,
        "generated_at": _now_iso(),
        "course_month": target_month,
        "course_week_now": current_week,
        "units_completed": unit_ids,
        "monthly_exams": monthly_exams,
        "monthly_average_percent": avg,
        "interaction": interaction,
        "recommendations": recommendations,
    }

