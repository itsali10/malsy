"""Persisted admin subject definitions (extends built-in English / Science / History)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import load_json, save_json

REGISTRY_KEY = "subject_registry.json"

BUILTIN_SUBJECTS: Dict[str, Dict[str, Any]] = {
    "english": {"subject_name": "English", "icon": "📖", "grade": 6, "builtin": True},
    "science": {"subject_name": "Science", "icon": "🔬", "grade": 6, "builtin": True},
    "history": {"subject_name": "History", "icon": "🏛️", "grade": 6, "builtin": True},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_registry() -> Dict[str, Any]:
    data = load_json(REGISTRY_KEY, default={"subjects": {}})
    if not isinstance(data, dict):
        return {"subjects": {}}
    if "subjects" not in data or not isinstance(data["subjects"], dict):
        data["subjects"] = {}
    return data


def _save_registry(data: Dict[str, Any]) -> None:
    save_json(REGISTRY_KEY, data)


def slug_subject_key(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    if not key:
        raise ValueError("Subject name must contain at least one letter or number")
    return key


def is_builtin_subject(subject_key: str) -> bool:
    return (subject_key or "").lower() in BUILTIN_SUBJECTS


LANGUAGE_SUBJECT_KEYS = frozenset(
    {"english", "french", "spanish", "arabic", "german", "mandarin", "chinese", "esl", "efl"}
)


def is_language_subject(subject_key: str) -> bool:
    key = (subject_key or "").lower().strip()
    if key in LANGUAGE_SUBJECT_KEYS:
        return True
    rec = get_subject_record(key)
    if rec:
        name = (rec.get("subject_name") or "").lower()
        if any(w in name for w in ("english", "language", "french", "spanish", "arabic", "mandarin")):
            return True
    return False


LANGUAGE_ONLY_ITEM_TYPES = frozenset({"listening", "speaking"})


def resolve_subject_key_from_chapter(chapter_id: str) -> str:
    from .book_registry import get_book_record, normalize_subject_key

    book_id = chapter_id.split(":")[0] if ":" in (chapter_id or "") else (chapter_id or "")
    if not book_id:
        return ""
    rec = get_book_record(book_id)
    if rec and rec.get("subject"):
        return normalize_subject_key(str(rec["subject"]))
    return normalize_subject_key(book_id.split("_")[0])


def subject_supports_listening(subject_key: str) -> bool:
    return is_language_subject(subject_key)


def subject_supports_pronunciation(subject_key: str) -> bool:
    return is_language_subject(subject_key)


def filter_unit_plan_for_subject(
    plan: Optional[Dict[str, Any]], subject_key: str
) -> Optional[Dict[str, Any]]:
    """Strip listening/pronunciation items from non-language subject plans."""
    if not plan or is_language_subject(subject_key):
        return plan
    items = plan.get("items") or []
    filtered = [
        i
        for i in items
        if (i.get("type") or "").lower() not in LANGUAGE_ONLY_ITEM_TYPES
        and not str(i.get("id") or "").lower().startswith(("listening", "speaking", "pronunciation"))
    ]
    if len(filtered) == len(items):
        return plan
    out = dict(plan)
    out["items"] = filtered
    return out


def get_custom_subject(subject_key: str) -> Optional[Dict[str, Any]]:
    reg = _load_registry()
    rec = reg["subjects"].get(subject_key)
    return dict(rec) if isinstance(rec, dict) else None


def get_subject_record(subject_key: str) -> Optional[Dict[str, Any]]:
    key = (subject_key or "").lower().strip()
    if not key:
        return None
    if key in BUILTIN_SUBJECTS:
        custom = get_custom_subject(key) or {}
        base = dict(BUILTIN_SUBJECTS[key])
        return {
            "subject_key": key,
            "subject_name": custom.get("subject_name") or base["subject_name"],
            "icon": custom.get("icon") or base["icon"],
            "grade": int(custom.get("grade") or base["grade"]),
            "visible_to_students": bool(custom.get("visible_to_students", True)),
            "archived": bool(custom.get("archived", False)),
            "builtin": True,
            "created_at": custom.get("created_at"),
        }
    custom = get_custom_subject(key)
    if not custom:
        return None
    return {
        "subject_key": key,
        "subject_name": custom.get("subject_name") or key,
        "icon": custom.get("icon") or "📚",
        "grade": int(custom.get("grade") or 6),
        "visible_to_students": bool(custom.get("visible_to_students", False)),
        "archived": bool(custom.get("archived", False)),
        "builtin": False,
        "created_at": custom.get("created_at"),
    }


def list_subject_records(*, include_archived: bool = True) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for key in BUILTIN_SUBJECTS:
        rec = get_subject_record(key)
        if rec:
            out.append(rec)
            seen.add(key)
    reg = _load_registry()
    for key in sorted((reg.get("subjects") or {}).keys()):
        if key in seen:
            continue
        rec = get_subject_record(key)
        if not rec:
            continue
        if not include_archived and rec.get("archived"):
            continue
        out.append(rec)
    return out


def all_subject_keys() -> List[str]:
    return [s["subject_key"] for s in list_subject_records(include_archived=True)]


def is_known_subject_key(subject_key: str) -> bool:
    return get_subject_record((subject_key or "").lower().strip()) is not None


def create_subject(
    *,
    subject_name: str,
    grade: int = 6,
    icon: str = "📚",
    visible_to_students: bool = False,
) -> Dict[str, Any]:
    key = slug_subject_key(subject_name)
    if key in BUILTIN_SUBJECTS:
        raise ValueError(f"Subject key '{key}' is reserved for a built-in subject")
    reg = _load_registry()
    if key in reg["subjects"]:
        raise ValueError(f"Subject '{key}' already exists")
    rec = {
        "subject_key": key,
        "subject_name": subject_name.strip(),
        "icon": icon or "📚",
        "grade": int(grade),
        "visible_to_students": bool(visible_to_students),
        "archived": False,
        "builtin": False,
        "created_at": _now_iso(),
    }
    reg["subjects"][key] = rec
    _save_registry(reg)
    return rec


def set_subject_visibility(subject_key: str, visible: bool) -> Dict[str, Any]:
    key = (subject_key or "").lower().strip()
    if key in BUILTIN_SUBJECTS:
        reg = _load_registry()
        rec = dict(reg["subjects"].get(key) or {})
        rec.update({
            "subject_key": key,
            "visible_to_students": bool(visible),
            "archived": False if visible else rec.get("archived", False),
        })
        reg["subjects"][key] = {**BUILTIN_SUBJECTS[key], **rec}
        _save_registry(reg)
        updated = get_subject_record(key)
        if not updated:
            raise KeyError(key)
        return updated
    reg = _load_registry()
    if key not in reg["subjects"]:
        raise KeyError(key)
    reg["subjects"][key]["visible_to_students"] = bool(visible)
    if visible:
        reg["subjects"][key]["archived"] = False
    _save_registry(reg)
    updated = get_subject_record(key)
    if not updated:
        raise KeyError(key)
    return updated


def set_subject_archived(subject_key: str, archived: bool) -> Dict[str, Any]:
    key = (subject_key or "").lower().strip()
    reg = _load_registry()
    if key in BUILTIN_SUBJECTS:
        rec = dict(reg["subjects"].get(key) or {})
        rec.update({
            "subject_key": key,
            "archived": bool(archived),
            "visible_to_students": False if archived else rec.get("visible_to_students", True),
        })
        reg["subjects"][key] = {**BUILTIN_SUBJECTS[key], **rec}
        _save_registry(reg)
    elif key in reg["subjects"]:
        reg["subjects"][key]["archived"] = bool(archived)
        if archived:
            reg["subjects"][key]["visible_to_students"] = False
        _save_registry(reg)
    else:
        raise KeyError(key)
    updated = get_subject_record(key)
    if not updated:
        raise KeyError(key)
    return updated


def is_subject_visible_to_students(subject_key: str) -> bool:
    rec = get_subject_record(subject_key)
    if not rec:
        return False
    if rec.get("archived"):
        return False
    return bool(rec.get("visible_to_students", False))
