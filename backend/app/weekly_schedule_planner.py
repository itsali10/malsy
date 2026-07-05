"""Realistic weekly day/subject layout for per-student lesson schedules.

Week starts Sunday. Sessions only Sun–Thu; Friday and Saturday are always rest days.
"""

from __future__ import annotations

import hashlib
import random
from datetime import date, timedelta
from typing import Dict, List, Optional, Set, Tuple

# Calendar week: Sunday → Saturday
DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

LEARNING_DAYS = DAY_ORDER[:5]  # Sun–Thu
REST_DAYS_FIXED = frozenset({"Friday", "Saturday"})

# 1 = learning day, 0 = rest within Sun–Thu; Fri/Sat always 0
_VALID_DAY_MASKS: Dict[int, List[List[int]]] = {
    5: [
        [1, 1, 1, 1, 1, 0, 0],
    ],
    4: [
        [1, 1, 1, 0, 1, 0, 0],
        [1, 1, 0, 1, 1, 0, 0],
        [1, 0, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 0, 0, 0],
    ],
}

# Canonical fallback when all three subjects are available (example from spec).
_EXAMPLE_PLAN: Dict[str, List[str]] = {
    "Sunday": ["english"],
    "Monday": ["science", "history"],
    "Tuesday": ["english"],
    "Wednesday": ["science"],
    "Thursday": ["english", "history"],
    "Friday": [],
    "Saturday": [],
}


def sunday_of_week(when: Optional[date] = None) -> date:
    """Return the Sunday that starts the calendar week containing ``when``."""
    when = when or date.today()
    # Python weekday: Mon=0 … Sun=6 → days since Sunday = (weekday + 1) % 7
    return when - timedelta(days=(when.weekday() + 1) % 7)


def monday_of_week(when: Optional[date] = None) -> date:
    """Deprecated alias — week starts on Sunday."""
    return sunday_of_week(when)


def student_week_seed(user_id: str, week_start: date) -> int:
    raw = f"{user_id}:{week_start.isoformat()}".encode()
    return int(hashlib.sha256(raw).hexdigest()[:8], 16)


def _active_day_names(mask: List[int]) -> List[str]:
    return [DAY_ORDER[i] for i, bit in enumerate(mask) if bit == 1 and DAY_ORDER[i] not in REST_DAYS_FIXED]


def _empty_plan() -> Dict[str, List[str]]:
    return {day: [] for day in DAY_ORDER}


def _subject_targets(available: Set[str], active_days: int, rng: random.Random) -> Dict[str, int]:
    """How many days each subject should appear (subject-day slots)."""
    targets: Dict[str, int] = {}
    if "english" in available:
        targets["english"] = min(rng.randint(2, 3), active_days)
    if "science" in available:
        targets["science"] = min(rng.randint(1, 2), active_days)
    if "history" in available:
        targets["history"] = min(rng.randint(1, 2), active_days)

    for key in sorted(available):
        if key in targets and targets[key] < 1:
            targets[key] = 1

    return targets


def _assign_subjects(active_days: List[str], available: Set[str], rng: random.Random) -> Dict[str, List[str]]:
    """Map each active Sun–Thu day to 1–3 subjects following grouping rules."""
    plan = _empty_plan()
    if not active_days:
        return plan

    targets = _subject_targets(available, len(active_days), rng)
    days = [d for d in active_days if d in LEARNING_DAYS]
    rng.shuffle(days)

    eng_left = targets.get("english", 0)
    sci_left = targets.get("science", 0)
    hist_left = targets.get("history", 0)

    # English alone on its own days first.
    eng_days: List[str] = []
    for day in days:
        if eng_left <= 0:
            break
        plan[day] = ["english"]
        eng_days.append(day)
        eng_left -= 1

    remaining = [d for d in days if d not in eng_days]

    # Science + History together when both still need slots.
    for day in remaining:
        if sci_left > 0 and hist_left > 0 and len(plan[day]) < 3:
            plan[day] = ["science", "history"]
            sci_left -= 1
            hist_left -= 1

    for day in remaining:
        if plan[day]:
            continue
        if sci_left > 0:
            plan[day] = ["science"]
            sci_left -= 1
        elif hist_left > 0:
            plan[day] = ["history"]
            hist_left -= 1
        elif eng_left > 0:
            plan[day] = ["english"]
            eng_left -= 1

    for key, left in (("english", eng_left), ("science", sci_left), ("history", hist_left)):
        for day in days:
            while left > 0 and len(plan[day]) < 3 and key not in plan[day]:
                plan[day].append(key)
                left -= 1
            if left <= 0:
                break

    # Heavy day (all three) → lighten the next learning day if possible.
    for i, day in enumerate(LEARNING_DAYS[:-1]):
        if len(plan[day]) >= 3:
            nxt = LEARNING_DAYS[i + 1]
            if nxt in days and plan[nxt] and len(plan[nxt]) < 3:
                moved = plan[day].pop()
                plan[nxt].insert(0, moved)

    for day in DAY_ORDER:
        if len(plan[day]) > 3:
            plan[day] = plan[day][:3]

    for day in days:
        if plan[day]:
            continue
        for key in ("english", "science", "history"):
            if key in available:
                plan[day] = [key]
                break

    # Friday and Saturday are always free.
    plan["Friday"] = []
    plan["Saturday"] = []

    return plan


def _filter_plan_to_available(plan: Dict[str, List[str]], available: Set[str]) -> Dict[str, List[str]]:
    out = _empty_plan()
    for day in DAY_ORDER:
        if day in REST_DAYS_FIXED:
            out[day] = []
        else:
            out[day] = [s for s in (plan.get(day) or []) if s in available]
    return out


def validate_weekly_plan(
    plan: Dict[str, List[str]],
    available: Set[str],
) -> Tuple[bool, List[str]]:
    """Validate generated weekly layout."""
    errors: List[str] = []

    for day in REST_DAYS_FIXED:
        if plan.get(day):
            errors.append(f"{day} must have 0 sessions")

    active_days = sum(1 for d in LEARNING_DAYS if plan.get(d))
    if active_days < 4 or active_days > 5:
        errors.append(f"active_days={active_days} (expected 4–5 within Sun–Thu)")

    for day in DAY_ORDER:
        if len(plan.get(day, [])) > 3:
            errors.append(f"{day} has more than 3 sessions")

    def day_count(key: str) -> int:
        return sum(1 for d in LEARNING_DAYS if key in (plan.get(d) or []))

    for key in available:
        if day_count(key) < 1:
            errors.append(f"{key} missing from schedule")

    if len(available) == 1:
        return len(errors) == 0, errors

    if "english" in available:
        ec = day_count("english")
        if ec < 2 or ec > 3:
            errors.append(f"english appears {ec} times (expected 2–3)")
        sci_c = day_count("science") if "science" in available else 0
        hist_c = day_count("history") if "history" in available else 0
        if (sci_c or hist_c) and ec <= max(sci_c, hist_c):
            errors.append("english should appear more often than science/history")

    for key in ("science", "history"):
        if key in available:
            c = day_count(key)
            if c < 1 or c > 2:
                errors.append(f"{key} appears {c} times (expected 1–2)")

    return len(errors) == 0, errors


def generate_weekly_plan(
    available_subjects: Set[str],
    *,
    seed: int,
    max_attempts: int = 48,
) -> Dict[str, List[str]]:
    """
    Build a validated weekly plan: day → ordered subject keys.
    Each student/week gets a unique but deterministic layout via seed.
    """
    available = {s for s in available_subjects if s in ("english", "science", "history")}
    if not available:
        return _empty_plan()

    rng = random.Random(seed)

    for _ in range(max_attempts):
        active_count = rng.choice([4, 5])
        masks = _VALID_DAY_MASKS.get(active_count, _VALID_DAY_MASKS[5])
        mask = list(rng.choice(masks))
        # Enforce fixed Fri/Sat rest regardless of mask content.
        mask[5] = 0
        mask[6] = 0

        active = _active_day_names(mask)
        plan = _assign_subjects(active, available, rng)
        ok, _errs = validate_weekly_plan(plan, available)
        if ok:
            return plan

    # Fallback: spec example filtered to available subjects, or full Sun–Thu fill.
    if available == {"english", "science", "history"}:
        return _filter_plan_to_available(_EXAMPLE_PLAN, available)

    fallback_mask = _VALID_DAY_MASKS[5][0]
    active = _active_day_names(fallback_mask)
    return _assign_subjects(active, available, random.Random(seed))
