"""Inspect on-disk book assets and Chroma index for a catalog-driven book."""

from __future__ import annotations

import json
import os
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_chroma_client
from .history_lessons import BOOKS_ROOT, _lessons_path, _manifest_path
from .models import Schedule, Subject

SEARCH_TERMS = [
    "history_g6",
    "history",
    "History G6",
    "World History",
    "Ancient Egyptians",
    "Where and Who Were the Ancient Egyptians?",
]


def _book_dir(book_key: str) -> str:
    return os.path.join(BOOKS_ROOT, book_key)


def _read_json(path: str) -> dict[str, Any] | None:
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _scan_tree_for_terms(root: str, terms: list[str]) -> list[dict[str, Any]]:
    if not os.path.isdir(root):
        return []
    hits: list[dict[str, Any]] = []
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, root)
            try:
                if name.endswith((".json", ".txt", ".md")):
                    with open(path, encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                else:
                    content = name
            except OSError:
                continue
            matched = [t for t in terms if t.lower() in content.lower() or t.lower() in rel.lower()]
            if matched:
                hits.append({"path": rel.replace("\\", "/"), "matched_terms": matched})
    return hits


def _chroma_status(book_key: str) -> dict[str, Any]:
    chroma_path = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
    chroma_path = os.path.normpath(chroma_path)
    if not os.path.isdir(chroma_path):
        return {
            "chroma_path": chroma_path,
            "collections": [],
            "unit_count": 0,
            "chunk_count": 0,
            "unit_ids": [],
        }

    client = get_chroma_client(chroma_path)
    collections = [c.name for c in client.list_collections()]
    unit_ids: list[str] = []
    chunk_count = 0

    if "units" in collections:
        units_col = client.get_collection("units")
        hist_units = units_col.get(where={"book_id": book_key})
        unit_ids = list(hist_units.get("ids") or [])

    if "pdf_chunks" in collections:
        chunks_col = client.get_collection("pdf_chunks")
        hist_chunks = chunks_col.get(where={"book_id": book_key})
        chunk_count = len(hist_chunks.get("ids") or [])

    return {
        "chroma_path": chroma_path,
        "collections": collections,
        "unit_count": len(unit_ids),
        "chunk_count": chunk_count,
        "unit_ids": unit_ids,
    }


async def inspect_book(book_key: str, db: AsyncSession) -> dict[str, Any]:
    book_dir = _book_dir(book_key)
    manifest_path = _manifest_path(book_key)
    lessons_path = _lessons_path(book_key)
    manifest = _read_json(manifest_path)

    pdf_path: str | None = None
    pdf_found = False
    if manifest and manifest.get("pdf_filename"):
        pdf_path = os.path.join(book_dir, manifest["pdf_filename"])
        pdf_found = os.path.isfile(pdf_path)

    lessons_found = os.path.isfile(lessons_path)
    manifest_found = os.path.isfile(manifest_path)
    uploaded_book_found = os.path.isdir(book_dir) and (manifest_found or lessons_found or pdf_found)

    chroma = _chroma_status(book_key)
    rag_index_found = chroma["unit_count"] > 0 and chroma["chunk_count"] > 0
    extracted_text_found = chroma["chunk_count"] > 0

    data_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data"))
    matching_records: list[dict[str, Any]] = []

    matching_records.extend(_scan_tree_for_terms(data_root, SEARCH_TERMS))

    interactive_root = os.path.join(data_root, "interactive_images", book_key)
    if os.path.isdir(interactive_root):
        matching_records.append({
            "path": f"interactive_images/{book_key}/",
            "matched_terms": ["history_g6"],
            "note": "interactive image manifests present",
        })

    hist_schedules = await db.execute(
        select(Schedule, Subject)
        .join(Subject, Subject.subject_id == Schedule.subject_id)
        .where(
            or_(
                Subject.subject_type == "History",
                Subject.subject_name.ilike("%history%"),
            )
        )
    )
    schedule_rows = hist_schedules.all()
    student_sessions_found = len(schedule_rows) > 0
    for row in schedule_rows:
        matching_records.append({
            "source": "database.schedules",
            "subject_name": row.Subject.subject_name,
            "subject_type": row.Subject.subject_type,
            "day_of_week": row.Schedule.day_of_week,
            "session_type": row.Schedule.session_type,
            "schedule_id": str(row.Schedule.schedule_id),
            "matched_terms": [t for t in SEARCH_TERMS if t.lower() in row.Subject.subject_name.lower()],
        })

    if lessons_found:
        catalog = _read_json(lessons_path) or {}
        for lesson in catalog.get("lessons") or []:
            title = lesson.get("title") or ""
            if any(t.lower() in title.lower() for t in SEARCH_TERMS):
                matching_records.append({
                    "source": "lessons.json",
                    "lesson_number": lesson.get("lessonNumber"),
                    "title": title,
                    "unit_id": lesson.get("id"),
                })

    return {
        "book_key": book_key,
        "uploaded_book_found": uploaded_book_found,
        "pdf_path": pdf_path,
        "pdf_found": pdf_found,
        "manifest_found": manifest_found,
        "extracted_text_found": extracted_text_found,
        "rag_index_found": rag_index_found,
        "lesson_catalog_found": lessons_found,
        "student_sessions_found": student_sessions_found,
        "book_directory": book_dir,
        "lessons_path": lessons_path,
        "manifest_path": manifest_path,
        "chroma": chroma,
        "matching_records": matching_records,
    }
