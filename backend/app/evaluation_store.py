from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .storage import load_json, save_json


# -------------------------
# Schema (stored JSON)
# -------------------------
# {
#   "student_id": str,
#   "updated_at": ISO8601 string,
#   "totals": {"attempts": int, "correct": int, "accuracy": float|null},
#   "recent_attempts": [ attempt, ... ],                 # last N
#   "by_unit": {unit_id: {"attempts": int, "correct": int, "accuracy": float|null}},
#   "by_item": { "unit_id:item_id": {"attempts": int, "incorrect": int, "remediation_used": int} },
#   "tutor_quality_events": [ {"ts":..., "unit_id":..., "signals": {...}}, ... ]  # last N
# }
#
# attempt:
# {
#   "ts": ISO8601 string,
#   "unit_id": str,
#   "item_id": str|null,
#   "quiz_question": str|null,
#   "correct": bool,
#   "hint_count_before": int,
#   "hint_count_after": int,
#   "remediation_used": bool,
# }


RECENT_LIMIT = 50
TUTOR_EVENTS_LIMIT = 50


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _key(student_id: str) -> str:
    return f"evaluation_{student_id}.json"


def load_student_eval(student_id: str) -> Dict[str, Any]:
    return load_json(
        _key(student_id),
        default={
            "student_id": student_id,
            "updated_at": None,
            "totals": {"attempts": 0, "correct": 0, "accuracy": None},
            "recent_attempts": [],
            "by_unit": {},
            "by_item": {},
            "tutor_quality_events": [],
        },
    )


def save_student_eval(student_id: str, data: Dict[str, Any]) -> None:
    data["student_id"] = student_id
    data["updated_at"] = _now_iso()
    save_json(_key(student_id), data)


def reset_student_eval(student_id: str) -> None:
    save_student_eval(student_id, load_student_eval(student_id) | {
        "totals": {"attempts": 0, "correct": 0, "accuracy": None},
        "recent_attempts": [],
        "by_unit": {},
        "by_item": {},
        "tutor_quality_events": [],
    })


def _safe_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _recalc_accuracy(correct: int, attempts: int) -> Optional[float]:
    if attempts <= 0:
        return None
    return round((correct / attempts) * 100.0, 2)


def record_quiz_attempt(
    *,
    student_id: str,
    unit_id: str,
    item_id: Optional[str],
    quiz_question: Optional[str],
    correct: bool,
    hint_count_before: int,
    hint_count_after: int,
    remediation_used: bool,
    tutor_quality_signals: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    data = load_student_eval(student_id)

    attempt = {
        "ts": _now_iso(),
        "unit_id": unit_id,
        "item_id": item_id,
        "quiz_question": quiz_question,
        "correct": bool(correct),
        "hint_count_before": _safe_int(hint_count_before),
        "hint_count_after": _safe_int(hint_count_after),
        "remediation_used": bool(remediation_used),
    }

    # totals
    totals = data.get("totals") or {"attempts": 0, "correct": 0, "accuracy": None}
    attempts = _safe_int(totals.get("attempts", 0)) + 1
    corr = _safe_int(totals.get("correct", 0)) + (1 if correct else 0)
    totals["attempts"] = attempts
    totals["correct"] = corr
    totals["accuracy"] = _recalc_accuracy(corr, attempts)
    data["totals"] = totals

    # recent_attempts
    recent = data.get("recent_attempts", [])
    if not isinstance(recent, list):
        recent = []
    recent.append(attempt)
    data["recent_attempts"] = recent[-RECENT_LIMIT:]

    # by_unit
    by_unit = data.get("by_unit", {})
    if not isinstance(by_unit, dict):
        by_unit = {}
    u = by_unit.get(unit_id) or {"attempts": 0, "correct": 0, "accuracy": None}
    u_attempts = _safe_int(u.get("attempts", 0)) + 1
    u_correct = _safe_int(u.get("correct", 0)) + (1 if correct else 0)
    u["attempts"] = u_attempts
    u["correct"] = u_correct
    u["accuracy"] = _recalc_accuracy(u_correct, u_attempts)
    by_unit[unit_id] = u
    data["by_unit"] = by_unit

    # by_item
    by_item = data.get("by_item", {})
    if not isinstance(by_item, dict):
        by_item = {}
    item_key = f"{unit_id}:{item_id or 'unknown'}"
    it = by_item.get(item_key) or {"attempts": 0, "incorrect": 0, "remediation_used": 0}
    it["attempts"] = _safe_int(it.get("attempts", 0)) + 1
    if not correct:
        it["incorrect"] = _safe_int(it.get("incorrect", 0)) + 1
    if remediation_used:
        it["remediation_used"] = _safe_int(it.get("remediation_used", 0)) + 1
    by_item[item_key] = it
    data["by_item"] = by_item

    # tutor quality events (best-effort)
    if tutor_quality_signals:
        events = data.get("tutor_quality_events", [])
        if not isinstance(events, list):
            events = []
        events.append({"ts": attempt["ts"], "unit_id": unit_id, "signals": tutor_quality_signals})
        data["tutor_quality_events"] = events[-TUTOR_EVENTS_LIMIT:]

    save_student_eval(student_id, data)
    return data


def eval_summary(student_id: str) -> Dict[str, Any]:
    data = load_student_eval(student_id)
    totals = data.get("totals") or {}

    recent = data.get("recent_attempts", [])
    if not isinstance(recent, list):
        recent = []
    window = recent[-10:]
    recent_attempts = len(window)
    recent_correct = sum(1 for a in window if isinstance(a, dict) and a.get("correct"))
    recent_accuracy = _recalc_accuracy(recent_correct, recent_attempts)

    # needs_review: incorrect>=2 OR remediation_used>=1 for any item
    needs_review: List[Dict[str, Any]] = []
    by_item = data.get("by_item", {})
    if isinstance(by_item, dict):
        for key, it in by_item.items():
            if not isinstance(it, dict):
                continue
            incorrect = _safe_int(it.get("incorrect", 0))
            remed = _safe_int(it.get("remediation_used", 0))
            if incorrect >= 2 or remed >= 1:
                unit_id, item_id = (key.split(":", 1) + ["unknown"])[:2]
                needs_review.append(
                    {
                        "unit_id": unit_id,
                        "item_id": item_id,
                        "incorrect": incorrect,
                        "remediation_used": remed,
                    }
                )

    return {
        "student_id": student_id,
        "updated_at": data.get("updated_at"),
        "totals": totals,
        "recent_window": {"attempts": recent_attempts, "correct": recent_correct, "accuracy": recent_accuracy},
        "needs_review": needs_review[:50],
    }


def unit_breakdown(student_id: str, unit_id: str) -> Dict[str, Any]:
    data = load_student_eval(student_id)
    by_unit = data.get("by_unit", {}) if isinstance(data.get("by_unit"), dict) else {}
    unit_stats = by_unit.get(unit_id) or {"attempts": 0, "correct": 0, "accuracy": None}

    recent = data.get("recent_attempts", [])
    if not isinstance(recent, list):
        recent = []
    unit_attempts = [a for a in recent if isinstance(a, dict) and a.get("unit_id") == unit_id]

    return {
        "student_id": student_id,
        "unit_id": unit_id,
        "stats": unit_stats,
        "recent_attempts": unit_attempts[-20:],
    }

