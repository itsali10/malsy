from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from .storage import load_json, save_json


def _timeline_key(student_id: str) -> str:
    return f"timeline_{student_id}.json"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept ISO strings with/without timezone; default to UTC if naive.
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def load_timeline(student_id: str) -> Dict[str, Any]:
    return load_json(
        _timeline_key(student_id),
        default={
            "student_id": student_id,
            "student_start_at": None,  # ISO string
            "taught_units": [],  # list[{unit_id, taught_at, completed_parts}]
        },
    )


def save_timeline(student_id: str, timeline: Dict[str, Any]) -> None:
    save_json(_timeline_key(student_id), timeline)


def ensure_student_start(student_id: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Ensure student_start_at exists. Returns updated timeline."""
    timeline = load_timeline(student_id)
    if timeline.get("student_start_at"):
        return timeline

    dt = now or _now_utc()
    timeline["student_start_at"] = _iso(dt)
    save_timeline(student_id, timeline)
    return timeline


def course_week_month(timeline: Dict[str, Any], now: Optional[datetime] = None) -> Tuple[int, int]:
    """Course-based windows: week/month from student_start_at.

    Week: floor((now-start)/7days)+1
    Month: floor((now-start)/30days)+1 (simple fixed 30-day buckets)
    """
    dt_now = (now or _now_utc()).astimezone(timezone.utc)
    start = _parse_dt(timeline.get("student_start_at")) or dt_now
    delta = dt_now - start
    if delta.total_seconds() < 0:
        delta = timedelta(seconds=0)

    week = int(delta.days // 7) + 1
    month = int(delta.days // 30) + 1
    return max(1, week), max(1, month)


def record_unit_completed(
    student_id: str,
    unit_id: str,
    completed_parts: int = 2,
    taught_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Append a unit completion record if not already recorded recently."""
    timeline = ensure_student_start(student_id)
    dt = taught_at or _now_utc()
    taught_units: List[Dict[str, Any]] = timeline.get("taught_units", [])

    # De-dup: if the latest record is same unit_id within 10 minutes, treat as same completion.
    if taught_units:
        last = taught_units[-1]
        if last.get("unit_id") == unit_id:
            last_dt = _parse_dt(last.get("taught_at"))
            if last_dt and abs((dt - last_dt).total_seconds()) <= 600:
                last["completed_parts"] = max(int(last.get("completed_parts", 0)), completed_parts)
                timeline["taught_units"] = taught_units
                save_timeline(student_id, timeline)
                return timeline

    taught_units.append(
        {
            "unit_id": unit_id,
            "taught_at": _iso(dt),
            "completed_parts": int(completed_parts),
        }
    )
    timeline["taught_units"] = taught_units
    save_timeline(student_id, timeline)
    return timeline


def units_in_course_week(timeline: Dict[str, Any], course_week: int) -> List[Dict[str, Any]]:
    start = _parse_dt(timeline.get("student_start_at"))
    if not start:
        return []
    week0 = start + timedelta(days=(course_week - 1) * 7)
    week1 = week0 + timedelta(days=7)

    out: List[Dict[str, Any]] = []
    for rec in timeline.get("taught_units", []) or []:
        dt = _parse_dt(rec.get("taught_at"))
        if dt and week0 <= dt < week1:
            out.append(rec)
    return out


def units_in_course_month(timeline: Dict[str, Any], course_month: int) -> List[Dict[str, Any]]:
    start = _parse_dt(timeline.get("student_start_at"))
    if not start:
        return []
    m0 = start + timedelta(days=(course_month - 1) * 30)
    m1 = m0 + timedelta(days=30)

    out: List[Dict[str, Any]] = []
    for rec in timeline.get("taught_units", []) or []:
        dt = _parse_dt(rec.get("taught_at"))
        if dt and m0 <= dt < m1:
            out.append(rec)
    return out

