"""Shared lesson counts from processed book structure (Admin + Student Portal)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from .book_registry import book_dir, get_book_record, get_primary_book, is_book_visible_to_students


def load_book_manifest(book_id: str) -> Optional[dict]:
    path = os.path.join(book_dir(book_id), "manifest.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def structure_counts_from_manifest(manifest: Optional[dict]) -> dict:
    """Count top-level units and lessons from manifest (same logic as Admin Student Content)."""
    units = (manifest or {}).get("units") or []
    if not units:
        return {"unit_count": 0, "lesson_count": 0}
    has_nested = any(isinstance(u.get("lessons"), list) and u["lessons"] for u in units)
    if has_nested:
        return {
            "unit_count": len(units),
            "lesson_count": sum(len(u.get("lessons") or []) for u in units),
        }
    prefixes: set[str] = set()
    for u in units:
        uid = str(u.get("unit_id") or "")
        if "_lesson_" in uid:
            prefixes.add(uid.split("_lesson_")[0])
        else:
            prefixes.add(uid)
    return {"unit_count": len(prefixes) or len(units), "lesson_count": len(units)}


def merge_book_lesson_counts(rec: dict, manifest: Optional[dict] = None) -> dict:
    """Prefer registry/manifest structure counts for units and lessons."""
    structure = structure_counts_from_manifest(manifest)
    out = {**rec}
    if structure["lesson_count"]:
        out["lesson_count"] = structure["lesson_count"]
    elif rec.get("lesson_count"):
        out["lesson_count"] = rec.get("lesson_count")
    if structure["unit_count"]:
        out["unit_count"] = structure["unit_count"]
    elif rec.get("unit_count"):
        out["unit_count"] = rec.get("unit_count")
    return out


def get_book_lesson_counts(book_id: str) -> Dict[str, int]:
    """Lesson/unit counts for a book from manifest + registry (no Chroma)."""
    rec = get_book_record(book_id) or {"book_id": book_id}
    manifest = load_book_manifest(book_id)
    merged = merge_book_lesson_counts(rec, manifest)
    lesson_count = int(merged.get("lesson_count") or 0)
    unit_count = int(merged.get("unit_count") or 0)
    if lesson_count == 0 and unit_count > 0:
        lesson_count = unit_count
    return {"lesson_count": lesson_count, "unit_count": unit_count}


def count_published_lessons_for_book(book_id: str) -> int:
    """
    Published lesson total for a book: processed, visible, not archived, plan-approved.
    Returns 0 when the book is not student-ready.
    """
    if not book_id or not is_book_visible_to_students(book_id):
        return 0
    rec = get_book_record(book_id)
    if rec and rec.get("archived"):
        return 0
    return get_book_lesson_counts(book_id)["lesson_count"]


def count_published_lessons_for_subject(registry_key: str, grade: int = 6) -> int:
    """Published lesson total for a subject's primary grade book."""
    book = get_primary_book(registry_key, grade=grade)
    if not book:
        return 0
    book_id = str(book.get("book_id") or "")
    if not book_id:
        return 0
    if int(book.get("grade") or grade) != int(grade):
        return 0
    return count_published_lessons_for_book(book_id)


def attach_available_lesson_counts(
    subjects: list[dict[str, Any]],
    *,
    default_grade: int = 6,
) -> list[dict[str, Any]]:
    """Enrich portal subject rows with available_lessons_count from book structure."""
    for row in subjects:
        key = str(row.get("subject_key") or "")
        grade = int(row.get("grade") or default_grade)
        count = count_published_lessons_for_subject(key, grade=grade) if key else 0
        row["available_lessons_count"] = count
    return subjects
