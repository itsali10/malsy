from typing import Any, Dict, Optional
from .storage import load_json, save_json

ACTIVE_SESSION_FILE = "active_session.json"

def load_active_session() -> Optional[Dict[str, Any]]:
    data = load_json(ACTIVE_SESSION_FILE, default=None)
    return data

def save_active_session(sess: Dict[str, Any]) -> None:
    save_json(ACTIVE_SESSION_FILE, sess)

def clear_active_session() -> None:
    save_json(ACTIVE_SESSION_FILE, None)
