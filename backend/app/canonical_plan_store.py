"""Canonical (admin-approved) unit plans — separate from per-student unitplan_*.json files."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from .storage import DATA_DIR, load_json, save_json

CANONICAL_ROOT = os.path.join(DATA_DIR, "canonical_unitplans")


def _safe_book(book_id: str) -> str:
    return (book_id or "").replace(":", "_")


def _safe_unit(unit_key: str) -> str:
    return (unit_key or "").replace(":", "_")


def _unit_path(book_id: str, unit_key: str) -> str:
    rel = os.path.join(_safe_book(book_id), f"{_safe_unit(unit_key)}.json")
    return os.path.join(CANONICAL_ROOT, rel)


def load_canonical_unit_plan(book_id: str, unit_key: str) -> Optional[Dict[str, Any]]:
    path = _unit_path(book_id, unit_key)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        import json

        return json.load(f)


def save_canonical_unit_plan(book_id: str, unit_key: str, plan: Dict[str, Any]) -> None:
    path = _unit_path(book_id, unit_key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        import json

        json.dump(plan, f, ensure_ascii=False, indent=2)


def list_canonical_unit_plan_keys(book_id: str) -> List[str]:
    book_dir = os.path.join(CANONICAL_ROOT, _safe_book(book_id))
    if not os.path.isdir(book_dir):
        return []
    return sorted(f[:-5] for f in os.listdir(book_dir) if f.endswith(".json"))


def delete_canonical_plans_for_book(book_id: str) -> None:
    book_dir = os.path.join(CANONICAL_ROOT, _safe_book(book_id))
    if not os.path.isdir(book_dir):
        return
    for name in os.listdir(book_dir):
        if name.endswith(".json"):
            try:
                os.remove(os.path.join(book_dir, name))
            except OSError:
                pass


def book_plan_filename(book_id: str) -> str:
    safe = book_id.replace(":", "_")
    return f"plan_{safe}.json"


def load_book_plan(book_id: str) -> Optional[Dict[str, Any]]:
    return load_json(book_plan_filename(book_id), default=None)


def save_book_plan(book_id: str, plan: Dict[str, Any]) -> None:
    save_json(book_plan_filename(book_id), plan)
