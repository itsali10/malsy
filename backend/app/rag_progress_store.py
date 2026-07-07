"""Persistent RAG job progress for admin UI (status display only — not used by ingest logic)."""

from __future__ import annotations

import contextvars
import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_PROGRESS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "rag_progress")
_lock = threading.Lock()
_active_book: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "rag_progress_book_id", default=None
)
_chunk_totals: Dict[str, int] = {}

STAGE_EXTRACTING_PDF = "extracting_pdf"
STAGE_DETECTING_UNITS = "detecting_units_lessons"
STAGE_CHUNKING = "chunking_content"
STAGE_EMBEDDING = "generating_embeddings"
STAGE_SAVING = "saving_vector_store"
STAGE_COMPLETED = "completed"
STAGE_FAILED = "failed"

STAGE_LABELS: Dict[str, str] = {
    STAGE_EXTRACTING_PDF: "Extracting PDF",
    STAGE_DETECTING_UNITS: "Detecting units and lessons",
    STAGE_CHUNKING: "Chunking content",
    STAGE_EMBEDDING: "Generating embeddings",
    STAGE_SAVING: "Saving vector store",
    STAGE_COMPLETED: "Completed",
    STAGE_FAILED: "Failed",
}

SAVE_BATCH_SIZE = 25


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _progress_path(book_id: str) -> str:
    os.makedirs(_PROGRESS_DIR, exist_ok=True)
    return os.path.join(_PROGRESS_DIR, f"{book_id}.json")


def _read_progress(book_id: str) -> Dict[str, Any]:
    path = _progress_path(book_id)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _write_progress(book_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    existing = _read_progress(book_id)
    merged = {**existing, **payload, "book_id": book_id, "updated_at": _now_iso()}
    if not merged.get("started_at"):
        merged["started_at"] = merged["updated_at"]
    path = _progress_path(book_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return merged


def clear_progress(book_id: str) -> None:
    with _lock:
        _chunk_totals.pop(book_id, None)
    path = _progress_path(book_id)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


def start_progress(book_id: str) -> Dict[str, Any]:
    clear_progress(book_id)
    return _write_progress(
        book_id,
        {
            "stage": STAGE_EXTRACTING_PDF,
            "stage_label": STAGE_LABELS[STAGE_EXTRACTING_PDF],
            "current": 0,
            "total": 0,
            "batch_current": 0,
            "batch_total": 0,
            "detail": STAGE_LABELS[STAGE_EXTRACTING_PDF],
            "error_message": None,
            "started_at": _now_iso(),
        },
    )


def set_stage(
    book_id: str,
    stage: str,
    *,
    current: Optional[int] = None,
    total: Optional[int] = None,
    detail: Optional[str] = None,
) -> Dict[str, Any]:
    label = STAGE_LABELS.get(stage, stage.replace("_", " ").title())
    payload: Dict[str, Any] = {
        "stage": stage,
        "stage_label": label,
        "detail": detail or label,
    }
    if current is not None:
        payload["current"] = int(current)
    if total is not None:
        payload["total"] = int(total)
        _chunk_totals[book_id] = int(total)
    if stage == STAGE_FAILED and detail:
        payload["error_message"] = detail
    return _write_progress(book_id, payload)


def bind_ingest_progress(book_id: str, *, total_chunks: int) -> None:
    """Activate per-chunk progress reporting for the current thread."""
    _active_book.set(book_id)
    with _lock:
        _chunk_totals[book_id] = max(0, int(total_chunks))


def unbind_ingest_progress() -> None:
    _active_book.set(None)


def report_chunk_saved() -> None:
    """Called after each chunk is embedded and stored (display-only hook)."""
    book_id = _active_book.get()
    if not book_id:
        return
    with _lock:
        rec = _read_progress(book_id)
        total = int(_chunk_totals.get(book_id) or rec.get("total") or 0)
        current = int(rec.get("current") or 0) + 1
        batch_total = max(1, (total + SAVE_BATCH_SIZE - 1) // SAVE_BATCH_SIZE) if total else 0
        batch_current = max(1, (current + SAVE_BATCH_SIZE - 1) // SAVE_BATCH_SIZE) if total else 0

        if total > 0 and current >= max(1, int(total * 0.85)):
            stage = STAGE_SAVING
            stage_label = STAGE_LABELS[STAGE_SAVING]
            detail = f"Saving batch {batch_current} / {batch_total}"
        else:
            stage = STAGE_EMBEDDING
            stage_label = STAGE_LABELS[STAGE_EMBEDDING]
            detail = f"Embedding chunk {current} / {total}" if total else f"Embedding chunk {current}"

        _write_progress(
            book_id,
            {
                "stage": stage,
                "stage_label": stage_label,
                "current": current,
                "total": total,
                "batch_current": batch_current,
                "batch_total": batch_total,
                "detail": detail,
            },
        )


def complete_progress(book_id: str, *, chunks_written: int = 0) -> Dict[str, Any]:
    unbind_ingest_progress()
    total = int(chunks_written or _chunk_totals.get(book_id) or 0)
    return _write_progress(
        book_id,
        {
            "stage": STAGE_COMPLETED,
            "stage_label": STAGE_LABELS[STAGE_COMPLETED],
            "current": total,
            "total": total,
            "batch_current": max(1, (total + SAVE_BATCH_SIZE - 1) // SAVE_BATCH_SIZE) if total else 0,
            "batch_total": max(1, (total + SAVE_BATCH_SIZE - 1) // SAVE_BATCH_SIZE) if total else 0,
            "detail": STAGE_LABELS[STAGE_COMPLETED],
            "error_message": None,
        },
    )


def fail_progress(book_id: str, error_message: str) -> Dict[str, Any]:
    unbind_ingest_progress()
    return set_stage(book_id, STAGE_FAILED, detail=str(error_message))


def get_progress(book_id: str) -> Optional[Dict[str, Any]]:
    rec = _read_progress(book_id)
    if not rec:
        return None
    return rec


def progress_to_api(rec: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not rec:
        return None
    stage = rec.get("stage") or ""
    return {
        "stage": stage,
        "stage_label": rec.get("stage_label") or STAGE_LABELS.get(stage, stage),
        "current": int(rec.get("current") or 0),
        "total": int(rec.get("total") or 0),
        "batch_current": int(rec.get("batch_current") or 0),
        "batch_total": int(rec.get("batch_total") or 0),
        "detail": rec.get("detail") or "",
        "error_message": rec.get("error_message"),
        "started_at": rec.get("started_at"),
        "updated_at": rec.get("updated_at"),
    }
