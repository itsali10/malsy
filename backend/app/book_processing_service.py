"""Background RAG ingest jobs for admin book processing."""

from __future__ import annotations

import json
import os
import threading
import traceback
from typing import Set

_running: Set[str] = set()
_lock = threading.Lock()


def is_ingest_running(book_id: str) -> bool:
    with _lock:
        return book_id in _running


def start_ingest_job(
    book_id: str,
    *,
    skip_structure_check: bool = False,
    reprocess: bool = False,
) -> bool:
    """
    Launch ingest in a daemon thread.
    Returns True when a new job was started, False if one is already running.
    """
    with _lock:
        if book_id in _running:
            print(f"[rag-process] ingest already running for {book_id}")
            return False
        _running.add(book_id)

    def _worker() -> None:
        try:
            run_ingest_job(
                book_id,
                skip_structure_check=skip_structure_check,
                reprocess=reprocess,
            )
        finally:
            with _lock:
                _running.discard(book_id)

    thread = threading.Thread(target=_worker, name=f"ingest-{book_id}", daemon=True)
    thread.start()
    print(f"[rag-process] background thread started for {book_id}")
    return True


def run_ingest_job(
    book_id: str,
    *,
    skip_structure_check: bool = False,
    reprocess: bool = False,
) -> None:
    """Run the full RAG pipeline synchronously (PDF → chunks → embeddings → Chroma)."""
    from .book_registry import (
        book_dir,
        get_book_record,
        is_structure_approved,
        set_book_status,
        upsert_book_record,
    )
    from .ingest_books import estimate_ingest_chunk_count, ingest_book_by_key
    from .rag_progress_store import (
        STAGE_CHUNKING,
        STAGE_DETECTING_UNITS,
        STAGE_EXTRACTING_PDF,
        bind_ingest_progress,
        complete_progress,
        fail_progress,
        set_stage,
        start_progress,
        unbind_ingest_progress,
    )
    from .unit_detection import refresh_manifest_units_from_pdf

    print(f"[rag-process] Starting RAG processing for {book_id}...")
    start_progress(book_id)
    try:
        if not skip_structure_check and not is_structure_approved(book_id):
            raise ValueError("Approve the extracted book structure before processing")

        if reprocess:
            upsert_book_record(
                book_id,
                plan_status=None,
                plan_generated_at=None,
                plan_approved_at=None,
                plan_error=None,
            )

        set_book_status(book_id, "processing")

        set_stage(book_id, STAGE_EXTRACTING_PDF)
        print(f"[rag-process] Extracting PDF for {book_id}...")
        refresh_manifest_units_from_pdf(book_id)

        set_stage(book_id, STAGE_DETECTING_UNITS)
        print(f"[rag-process] Detecting lessons for {book_id}...")
        try:
            from .book_lessons_catalog import sync_lessons_catalog_from_manifest

            sync_lessons_catalog_from_manifest(book_id)
        except Exception as exc:
            print(f"[rag-process] lesson catalog sync warning for {book_id}: {exc}")

        set_stage(book_id, STAGE_CHUNKING)
        print(f"[rag-process] Creating chunks for {book_id}...")
        bdir = book_dir(book_id)
        estimated_chunks = estimate_ingest_chunk_count(bdir)
        set_stage(
            book_id,
            STAGE_CHUNKING,
            current=0,
            total=estimated_chunks,
            detail=f"Preparing {estimated_chunks} chunks" if estimated_chunks else "Chunking content",
        )

        bind_ingest_progress(book_id, total_chunks=estimated_chunks)
        print(f"[rag-process] Generating embeddings for {book_id}...")
        print(f"[rag-process] Saving vector database for {book_id}...")
        result = ingest_book_by_key(book_id, purge=True)
        unbind_ingest_progress()

        counts = _chroma_counts(book_id)
        ingested_lessons = int(result.get("units_ingested") or 0)
        manifest_path = os.path.join(book_dir(book_id), "manifest.json")
        manifest = None
        if os.path.isfile(manifest_path):
            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)
        structure = _structure_counts_from_manifest(manifest)
        chunks_written = int(result.get("chunks_written") or counts.get("chunk_count") or 0)
        upsert_book_record(
            book_id,
            status="processed",
            unit_count=structure["unit_count"] or ingested_lessons,
            lesson_count=structure["lesson_count"] or ingested_lessons,
            chunk_count=counts["chunk_count"] or chunks_written,
            error_message=None,
        )

        try:
            from .lesson_content_mapping import ensure_book_ready_for_students

            ensure_book_ready_for_students(book_id)
        except Exception:
            traceback.print_exc()

        if not reprocess:
            try:
                from .book_plan_service import generate_book_lesson_plan

                generate_book_lesson_plan(book_id, force=False)
            except Exception as exc:
                traceback.print_exc()
                upsert_book_record(book_id, plan_status="failed", plan_error=str(exc))

        complete_progress(book_id, chunks_written=chunks_written)
        print(f"[rag-process] Finished {book_id} ({chunks_written} chunks indexed)")
    except Exception as exc:
        traceback.print_exc()
        unbind_ingest_progress()
        fail_progress(book_id, str(exc))
        print(f"[rag-process] Failed {book_id}: {exc}")
        set_book_status(book_id, "failed", error_message=str(exc))


def _chroma_counts(book_id: str) -> dict:
    try:
        from .db import get_chroma_client

        client = get_chroma_client("chroma_db")
        col = client.get_or_create_collection("units")
        unit_count = len((col.get(where={"book_id": book_id}) or {}).get("ids") or [])
        col = client.get_or_create_collection("pdf_chunks")
        chunk_count = len((col.get(where={"book_id": book_id}) or {}).get("ids") or [])
        return {"unit_count": unit_count, "chunk_count": chunk_count}
    except Exception:
        return {"unit_count": 0, "chunk_count": 0}


def _structure_counts_from_manifest(manifest: dict | None) -> dict:
    from .book_lesson_counts import structure_counts_from_manifest

    return structure_counts_from_manifest(manifest)
