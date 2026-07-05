"""On-disk registry for uploaded books — status, visibility, and metadata."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .storage import load_json, save_json

REGISTRY_KEY = "book_registry.json"
BOOKS_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "books")

STATUSES = ("uploaded", "processing", "processed", "failed")
STRUCTURE_STATUSES = ("pending", "extracting", "draft", "approved")

# Canonical admin/student subject keys
ADMIN_SUBJECTS = ("english", "science", "history")

SUBJECT_ALIASES: Dict[str, str] = {
    "english": "english",
    "english_g6": "english",
    "eng": "english",
    "science": "science",
    "science_g6": "science",
    "sci": "science",
    "chemistry": "science",
    "chem": "science",
    "history": "history",
    "history_g6": "history",
    "hist": "history",
}


def _all_known_subject_keys() -> tuple:
    from .subject_registry import all_subject_keys

    keys = list(ADMIN_SUBJECTS) + [k for k in all_subject_keys() if k not in ADMIN_SUBJECTS]
    return tuple(dict.fromkeys(keys))


def normalize_subject_key(value: Optional[str]) -> Optional[str]:
    """Map subject, book_id, title fragment → known subject key."""
    if not value:
        return None
    raw = str(value).lower().strip()
    if raw in SUBJECT_ALIASES:
        return SUBJECT_ALIASES[raw]
    known = _all_known_subject_keys()
    if raw in known:
        return raw
    # book_id patterns: history_g6, geography_g7
    for key in known:
        if raw == key or raw.startswith(f"{key}_g") or raw.startswith(f"{key}-"):
            return key
    from .subject_registry import is_known_subject_key

    base = raw.split("_")[0].split("-")[0]
    if is_known_subject_key(base):
        return base
    # manifest subject field or title hints (built-ins)
    if "english" in raw:
        return "english"
    if "history" in raw or "ancient egypt" in raw:
        return "history"
    if "science" in raw or "chemistry" in raw or "chem" in raw:
        return "science"
    if base in ADMIN_SUBJECTS:
        return base
    return None


def canonical_book_id(subject_key: str, grade: int = 6) -> str:
    key = normalize_subject_key(subject_key) or subject_key
    return f"{key}_g{int(grade)}"


def _infer_subject_from_record(book_id: str, rec: Dict[str, Any], manifest: Optional[Dict[str, Any]] = None) -> str:
    for candidate in (
        rec.get("subject"),
        rec.get("book_key"),
        rec.get("catalog_key"),
        rec.get("source_book"),
        (manifest or {}).get("subject"),
        (manifest or {}).get("book_id"),
        book_id,
        rec.get("title"),
    ):
        norm = normalize_subject_key(str(candidate) if candidate else None)
        if norm:
            return norm
    return book_id.split("_")[0] if book_id else "unknown"


def books_for_subject(subject_key: str, *, include_archived: bool = True) -> List[Dict[str, Any]]:
    norm = normalize_subject_key(subject_key)
    if not norm:
        return []
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for rec in list_book_records(include_archived=include_archived):
        bid = rec.get("book_id") or ""
        rec_subject = normalize_subject_key(rec.get("subject") or bid)
        if rec_subject == norm or normalize_subject_key(bid) == norm:
            if bid not in seen:
                seen.add(bid)
                out.append(rec)
    return out


def get_primary_book(subject_key: str, grade: int = 6) -> Optional[Dict[str, Any]]:
    """Prefer canonical {subject}_g{grade}, else first matching book on disk."""
    norm = normalize_subject_key(subject_key)
    if not norm:
        return None
    canonical = canonical_book_id(norm, grade)
    rec = get_book_record(canonical)
    if rec:
        return rec
    matches = books_for_subject(norm)
    if matches:
        return matches[0]
    if _has_manifest(canonical):
        sync_from_disk()
        return get_book_record(canonical)
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_registry() -> Dict[str, Any]:
    data = load_json(REGISTRY_KEY, default={"books": {}})
    if not isinstance(data, dict):
        return {"books": {}}
    if "books" not in data or not isinstance(data["books"], dict):
        data["books"] = {}
    return data


def _save_registry(data: Dict[str, Any]) -> None:
    save_json(REGISTRY_KEY, data)


def slug_book_id(subject: str, grade: int, title: str = "") -> str:
    """Default upload id — canonical {subject}_g{grade} when possible."""
    norm = normalize_subject_key(subject)
    if not norm:
        from .subject_registry import slug_subject_key

        try:
            norm = slug_subject_key(subject)
        except ValueError:
            norm = re.sub(r"[^a-z0-9]+", "_", (subject or "book").lower()).strip("_")
    return canonical_book_id(norm, grade)


def get_book_record(book_id: str) -> Optional[Dict[str, Any]]:
    reg = _load_registry()
    rec = reg["books"].get(book_id)
    return dict(rec) if isinstance(rec, dict) else None


def list_book_records(*, include_archived: bool = True) -> List[Dict[str, Any]]:
    reg = _load_registry()
    out: List[Dict[str, Any]] = []
    for book_id, rec in sorted((reg.get("books") or {}).items()):
        if not isinstance(rec, dict):
            continue
        item = dict(rec)
        item.setdefault("book_id", book_id)
        if not include_archived and item.get("archived"):
            continue
        out.append(item)
    return out


def is_book_visible_to_students(book_id: Optional[str]) -> bool:
    if not book_id:
        return True
    rec = get_book_record(book_id)
    if not rec:
        # Legacy books without registry entries remain visible if ingested.
        return _has_manifest(book_id)
    if rec.get("archived"):
        return False
    if not rec.get("visible_to_students", False):
        return False
    if rec.get("status") != "processed":
        return False
    from .book_plan_service import is_plan_approved_for_students

    if not is_plan_approved_for_students(book_id):
        return False
    subject_key = normalize_subject_key(rec.get("subject") or book_id)
    if subject_key:
        from .subject_registry import is_subject_visible_to_students

        if not is_subject_visible_to_students(subject_key):
            return False
    return True


def _has_manifest(book_id: str) -> bool:
    return os.path.isfile(os.path.join(BOOKS_ROOT, book_id, "manifest.json"))


def sync_from_disk() -> None:
    """Ensure registry has entries for books on disk; refresh subject metadata."""
    reg = _load_registry()
    changed = False
    if not os.path.isdir(BOOKS_ROOT):
        return
    for name in sorted(os.listdir(BOOKS_ROOT)):
        book_dir_path = os.path.join(BOOKS_ROOT, name)
        manifest_path = os.path.join(book_dir_path, "manifest.json")
        if not os.path.isdir(book_dir_path) or not os.path.isfile(manifest_path):
            continue
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        existing = reg["books"].get(name) if isinstance(reg["books"].get(name), dict) else {}
        subject = _infer_subject_from_record(name, existing, manifest)
        from .canonical_plan_store import book_plan_filename
        from .storage import DATA_DIR

        plan_path = os.path.join(DATA_DIR, book_plan_filename(name))
        plan_status = existing.get("plan_status")
        if not plan_status and os.path.isfile(plan_path):
            plan_status = "approved"
        entry = {
            "book_id": name,
            "title": manifest.get("title") or existing.get("title") or name,
            "subject": subject,
            "grade": manifest.get("grade") or existing.get("grade") or 6,
            "status": existing.get("status") or "processed",
            "visible_to_students": existing.get("visible_to_students", True),
            "archived": existing.get("archived", False),
            "pdf_filename": manifest.get("pdf_filename") or existing.get("pdf_filename") or "book.pdf",
            "uploaded_at": existing.get("uploaded_at") or _now_iso(),
            "processed_at": existing.get("processed_at") or _now_iso(),
            "error_message": existing.get("error_message"),
            "unit_count": len(manifest.get("units") or []) or existing.get("unit_count"),
            "chunk_count": existing.get("chunk_count"),
            "book_key": name,
            "catalog_key": manifest.get("book_id") or name,
            "plan_status": plan_status,
            "plan_approved_at": existing.get("plan_approved_at"),
            "plan_generated_at": existing.get("plan_generated_at"),
            "plan_error": existing.get("plan_error"),
        }
        if name not in reg["books"] or reg["books"][name] != entry:
            reg["books"][name] = {**existing, **entry}
            changed = True
    if changed:
        _save_registry(reg)


def upsert_book_record(book_id: str, **fields: Any) -> Dict[str, Any]:
    reg = _load_registry()
    rec = dict(reg["books"].get(book_id) or {})
    rec.update(fields)
    rec["book_id"] = book_id
    if rec.get("subject"):
        norm = normalize_subject_key(rec["subject"])
        if norm:
            rec["subject"] = norm
    rec.setdefault("visible_to_students", False)
    rec.setdefault("archived", False)
    rec.setdefault("status", "uploaded")
    reg["books"][book_id] = rec
    _save_registry(reg)
    return rec


def set_book_status(book_id: str, status: str, *, error_message: Optional[str] = None) -> Dict[str, Any]:
    if status not in STATUSES:
        raise ValueError(f"Invalid status: {status}")
    fields: Dict[str, Any] = {"status": status}
    if status == "processed":
        fields["processed_at"] = _now_iso()
        fields["error_message"] = None
    elif status == "failed":
        fields["error_message"] = error_message or "Processing failed"
    elif status == "processing":
        fields["error_message"] = None
    return upsert_book_record(book_id, **fields)


def set_visibility(book_id: str, visible: bool) -> Dict[str, Any]:
    rec = get_book_record(book_id)
    if not rec:
        raise KeyError(book_id)
    if visible and rec.get("status") != "processed":
        raise ValueError("Only processed books can be made visible to students")
    if visible:
        from .book_plan_service import is_plan_approved_for_students

        if not is_plan_approved_for_students(book_id):
            raise ValueError(
                "Approve the AI-generated lesson plan before making this book visible to students"
            )
        subject_key = normalize_subject_key(rec.get("subject") or book_id)
        if subject_key:
            from .subject_registry import set_subject_visibility

            set_subject_visibility(subject_key, True)
        try:
            from .book_lessons_catalog import ensure_lessons_catalog
            from .lesson_content_mapping import ensure_book_ready_for_students

            ensure_book_ready_for_students(book_id)
            ensure_lessons_catalog(book_id)
        except Exception:
            pass
    else:
        subject_key = normalize_subject_key(rec.get("subject") or book_id)
        if subject_key:
            from .subject_registry import set_subject_visibility

            set_subject_visibility(subject_key, False)
    return upsert_book_record(book_id, visible_to_students=bool(visible))


def set_archived(book_id: str, archived: bool) -> Dict[str, Any]:
    rec = get_book_record(book_id)
    if not rec:
        raise KeyError(book_id)
    fields: Dict[str, Any] = {"archived": bool(archived)}
    if archived:
        fields["visible_to_students"] = False
    return upsert_book_record(book_id, **fields)


def book_dir(book_id: str) -> str:
    return os.path.join(BOOKS_ROOT, book_id)


def create_upload_manifest(
    book_id: str,
    *,
    title: str,
    subject: str,
    grade: int,
    pdf_filename: str,
) -> Dict[str, Any]:
    manifest = {
        "book_id": book_id,
        "title": title,
        "subject": subject,
        "grade": grade,
        "pdf_filename": pdf_filename,
        "pdf_page_offset": 0,
        "units": [
            {
                "unit_id": "unit_01",
                "title": title or "Unit 1",
                "start_page": 1,
            }
        ],
    }
    return manifest


def is_structure_approved(book_id: str) -> bool:
    """True when admin confirmed extracted TOC/units, or legacy processed book."""
    rec = get_book_record(book_id)
    if not rec:
        return False
    if rec.get("status") == "processed":
        return True
    return rec.get("structure_status") == "approved"


def book_processing_pipeline(rec: Dict[str, Any]) -> Dict[str, bool]:
    """Derive admin-visible ingest pipeline steps from book registry fields."""
    status = rec.get("status") or "uploaded"
    plan_status = rec.get("plan_status")
    structure_status = rec.get("structure_status")
    book_id = rec.get("book_id") or ""
    legacy_processed = status == "processed" and not structure_status
    structure_extracted = structure_status in ("draft", "approved") or legacy_processed
    structure_approved = structure_status == "approved" or legacy_processed
    detection_method = str(rec.get("structure_detection_method") or "")
    unit_count = int(rec.get("unit_count") or 0)
    lesson_count = int(rec.get("lesson_count") or 0)
    if lesson_count == 0 and unit_count > 0:
        lesson_count = unit_count

    toc_detected = detection_method in ("table_of_contents", "chapter_headings") or (
        legacy_processed and unit_count >= 2
    )

    from .book_plan_service import is_plan_approved_for_students

    plan_ok = plan_status == "approved" or (legacy_processed and is_plan_approved_for_students(book_id))

    return {
        "pdf_uploaded": bool(rec.get("uploaded_at")),
        "text_extracted": structure_extracted or status in ("processing", "processed"),
        "toc_detected": toc_detected,
        "units_detected": unit_count >= 1 and (structure_extracted or status == "processed"),
        "lessons_detected": lesson_count >= 1 and (structure_extracted or status == "processed"),
        "structure_extracted": structure_extracted,
        "structure_approved": structure_approved,
        "rag_indexed": status == "processed" and bool(rec.get("chunk_count")),
        "lesson_plan_generated": plan_status in ("draft", "approved"),
        "plan_approved": plan_status == "approved" or (legacy_processed and is_plan_approved_for_students(book_id)),
        "visible_to_students": bool(rec.get("visible_to_students")),
        "student_sessions_created": bool(rec.get("schedule_in_student_portal")),
        "ready_for_students": status == "processed" and structure_approved and plan_ok,
    }
