"""Persistent storage for generated listening activities (one per unit/lesson)."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from .storage import load_json, save_json


def _listening_key(unit_id: str) -> str:
    safe = (unit_id or "unknown").replace(":", "_").replace("/", "_")
    return f"listening/{safe}.json"


def load_listening(unit_id: str) -> Optional[Dict[str, Any]]:
    return load_json(_listening_key(unit_id), default=None)


def save_listening(unit_id: str, activity: Dict[str, Any]) -> None:
    save_json(_listening_key(unit_id), activity)


def delete_listening(unit_id: str) -> bool:
    """Remove cached listening activity for a unit (admin regenerate)."""
    from .storage import DATA_DIR

    path = os.path.join(DATA_DIR, _listening_key(unit_id))
    if os.path.isfile(path):
        os.remove(path)
        return True
    return False
