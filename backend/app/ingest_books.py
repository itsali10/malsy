"""
Unified book ingestion pipeline.

Extracts PDF text, chunks, embeds, stores vectors in Chroma, and updates on-disk
catalogs (manifest units, lessons.json sync, sections.json).

Re-ingesting a book purges only that book's vectors — lesson plans, progress,
and generated content under data/ are never touched.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader

from .book_sections import ANCHOR_SECTION_TYPES, build_unit_sections, section_anchor_text
from .db import get_chroma_client, get_collection
from .embeddings import get_embedder
from .history_lessons import (
    create_history_embedding_chunk_metadata,
    get_lesson_parts,
    is_non_teachable_history_content,
    sync_manifest_from_catalog,
    validate_lesson_catalog,
)

BOOKS_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "books")

BOOK_ALIASES = {
    "english": "english_g6",
    "history": "history_g6",
}


def simple_chunk(text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    chunks: List[str] = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + chunk_size])
        i += chunk_size - overlap
    return chunks


def load_manifest(book_dir: str) -> Dict[str, Any]:
    path = os.path.join(book_dir, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def pdf_path(book_dir: str, manifest: Dict[str, Any]) -> str:
    return os.path.join(book_dir, manifest["pdf_filename"])


def book_page_to_pdf_index(book_page: int, pdf_page_offset: int) -> int:
    return (book_page + pdf_page_offset) - 1


def resolve_book_id(book_key: str) -> str:
    key = (book_key or "").strip().lower()
    return BOOK_ALIASES.get(key, book_key)


def resolve_book_dir(books_root: str, book_key: str) -> str:
    book_id = resolve_book_id(book_key)
    return os.path.join(books_root, book_id)


def list_ingestible_books(books_root: str) -> List[str]:
    out: List[str] = []
    if not os.path.isdir(books_root):
        return out
    for name in sorted(os.listdir(books_root)):
        book_dir = os.path.join(books_root, name)
        if os.path.isdir(book_dir) and os.path.exists(os.path.join(book_dir, "manifest.json")):
            out.append(name)
    return out


def compute_ranges(
    units: List[Dict[str, Any]], pdf_offset: int, pdf_total_pages: int
) -> List[Dict[str, Any]]:
    units_sorted = sorted(units, key=lambda u: int(u.get("start_page", 0)))
    ranges: List[Dict[str, Any]] = []
    for i, u in enumerate(units_sorted):
        start_book = int(u.get("start_page", 0))
        start_pdf = book_page_to_pdf_index(start_book, pdf_offset)

        if start_pdf < 0:
            start_pdf = 0
        if start_pdf >= pdf_total_pages:
            start_pdf = pdf_total_pages - 1

        if i + 1 < len(units_sorted):
            next_start_book = int(units_sorted[i + 1].get("start_page", 0))
            end_pdf = book_page_to_pdf_index(next_start_book, pdf_offset) - 1
        else:
            end_pdf = pdf_total_pages - 1

        if end_pdf < start_pdf:
            end_pdf = start_pdf

        end_book = u.get("end_page", None)
        if end_book is not None:
            end_pdf_from_manifest = book_page_to_pdf_index(int(end_book), pdf_offset)
            if 0 <= end_pdf_from_manifest < pdf_total_pages:
                end_pdf = end_pdf_from_manifest
            if end_pdf < start_pdf:
                end_pdf = start_pdf

        ranges.append(
            {
                "unit_id": u["unit_id"],
                "title": u["title"],
                "start_book_page": start_book,
                "end_book_page": end_book,
                "start_page": start_book,
                "end_page": end_book,
                "start_pdf": start_pdf,
                "end_pdf": end_pdf,
            }
        )
    return ranges


def extract_pdf_text(reader: PdfReader, start_pdf: int, end_pdf: int) -> List[Tuple[int, str]]:
    out: List[Tuple[int, str]] = []
    for p in range(start_pdf, end_pdf + 1):
        txt = reader.pages[p].extract_text() or ""
        out.append((p, txt))
    return out


def sanitize_chroma_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Chroma accepts scalars only — stringify list values."""
    out: Dict[str, Any] = {}
    for key, value in meta.items():
        if isinstance(value, list):
            out[key] = ", ".join(str(v) for v in value)
        else:
            out[key] = value
    return out


def purge_book_vectors(chunks_col, book_id: str, *, units_col=None) -> int:
    """Remove all Chroma vectors (chunks and units) for one book."""
    removed = 0
    try:
        data = chunks_col.get(where={"book_id": book_id}, include=[])
        ids = data.get("ids") or []
        if ids:
            chunks_col.delete(ids=ids)
            removed += len(ids)
    except Exception:
        pass
    if units_col is not None:
        try:
            data = units_col.get(where={"book_id": book_id}, include=[])
            ids = data.get("ids") or []
            if ids:
                units_col.delete(ids=ids)
                removed += len(ids)
        except Exception:
            pass
    return removed


def _add_chunk(
    chunks_col,
    embedder,
    *,
    chunk_id: str,
    text: str,
    meta: Dict[str, Any],
) -> None:
    vec = embedder.embed_query(text)
    chunks_col.add(
        ids=[chunk_id],
        documents=[text],
        embeddings=[vec],
        metadatas=[sanitize_chroma_metadata(meta)],
    )


def _lessons_path(book_dir: str) -> str:
    return os.path.join(book_dir, "lessons.json")


def _topic_hits(text: str, topics: List[str]) -> int:
    from .history_lessons import _topic_in_text

    return sum(1 for t in topics if _topic_in_text(t, text))


def _assign_part_index(chunk_text: str, lesson: Dict[str, Any]) -> Optional[int]:
    parts = get_lesson_parts(lesson)
    if len(parts) <= 1:
        return 0
    scored = [
        (_topic_hits(chunk_text, list(p.get("ownedTopics") or p.get("allowedTopics") or [])), i)
        for i, p in enumerate(parts)
    ]
    best_score, best_idx = max(scored, key=lambda x: (x[0], -x[1]))
    if best_score == 0:
        return None
    return best_idx


def _create_history_embedding_chunks(
    lesson: Dict[str, Any],
    page_text: str,
    *,
    book_id: str,
    pdf_page: int,
    book_page: int,
) -> List[Dict[str, Any]]:
    raw_chunks = [c for c in simple_chunk(page_text) if c.strip()]
    teachable = [c for c in raw_chunks if not is_non_teachable_history_content(c)]
    if not teachable:
        return []

    out: List[Dict[str, Any]] = []
    for ci, chunk in enumerate(teachable):
        part_index = _assign_part_index(chunk, lesson)
        if part_index is None:
            continue
        meta = create_history_embedding_chunk_metadata(
            book_id=book_id,
            lesson=lesson,
            part_index=part_index,
            chunk_text=chunk,
            page_number=pdf_page,
            chunk_index=ci,
            section_title=lesson.get("sourceSectionTitle") or lesson.get("title") or "",
        )
        meta["book_page"] = book_page
        out.append({"text": chunk, "meta": meta, "part_index": part_index})
    return out


def _ingest_lessons_catalog_book(
    book_dir: str,
    manifest: Dict[str, Any],
    *,
    chroma_path: str,
    chunks_col,
    units_col,
    embedder,
    purged: int,
) -> Dict[str, Any]:
    book_id = manifest["book_id"]
    title = manifest.get("title", book_id)
    pdf_offset = int(manifest.get("page_map", {}).get("pdf_page_offset", 0))

    sync_manifest_from_catalog(book_id)
    validation = validate_lesson_catalog(book_id)
    if not validation.get("valid"):
        for err in validation.get("errors") or []:
            print(f"  [warn] lessons catalog: {err}")

    with open(_lessons_path(book_dir), "r", encoding="utf-8") as f:
        catalog = json.load(f)
    lessons: List[Dict[str, Any]] = catalog.get("lessons") or []

    reader = PdfReader(pdf_path(book_dir, manifest))
    total_pages = len(reader.pages)
    chunks_written = 0
    seen_text_keys: set = set()

    for lesson in lessons:
        unit_short = lesson["unit_id"]
        lesson_id = lesson.get("id") or f"{book_id}:{unit_short}"
        lesson_title = lesson.get("title") or unit_short
        lesson_number = int(lesson.get("lessonNumber", 0))
        start_book = int(lesson.get("start_page", 0))
        end_book = int(lesson.get("end_page", start_book))

        start_pdf = book_page_to_pdf_index(start_book, pdf_offset)
        end_pdf = book_page_to_pdf_index(end_book, pdf_offset)
        start_pdf = max(0, min(start_pdf, total_pages - 1))
        end_pdf = max(start_pdf, min(end_pdf, total_pages - 1))

        units_col.upsert(
            ids=[lesson_id],
            documents=[lesson_title],
            metadatas=[
                sanitize_chroma_metadata(
                    {
                        "book_id": book_id,
                        "subject": "history",
                        "unit_id": lesson_id,
                        "lesson_id": lesson_id,
                        "lesson_number": lesson_number,
                        "title": lesson_title,
                        "start_pdf": start_pdf,
                        "end_pdf": end_pdf,
                        "start_book_page": start_book,
                        "end_book_page": end_book,
                        "start_page": start_book,
                        "end_page": end_book,
                        "pdf_page_offset": pdf_offset,
                    }
                )
            ],
        )

        for pdf_page in range(start_pdf, end_pdf + 1):
            page_text = (reader.pages[pdf_page].extract_text() or "").strip()
            book_page = pdf_page - pdf_offset + 1
            page_chunks = _create_history_embedding_chunks(
                lesson,
                page_text,
                book_id=book_id,
                pdf_page=pdf_page,
                book_page=book_page,
            )
            for item in page_chunks:
                chunk = item["text"]
                meta = item["meta"]
                text_key = re.sub(r"\s+", " ", chunk.lower().strip())[:200]
                owner = f"{meta['lesson_id']}:{text_key}"
                if owner in seen_text_keys:
                    continue
                seen_text_keys.add(owner)

                pid = meta["lesson_part_id"]
                chunk_id = f"{pid}:p{pdf_page}:c{meta['chunk_index']}"
                _add_chunk(chunks_col, embedder, chunk_id=chunk_id, text=chunk, meta=meta)
                chunks_written += 1

    return {
        "book_id": book_id,
        "title": title,
        "ingest_mode": "lessons_catalog",
        "units_ingested": len(lessons),
        "lessons_ingested": len(lessons),
        "chunks_written": chunks_written,
        "chunks_purged": purged,
        "pdf_pages": total_pages,
        "catalog_validation": validation,
    }


def _write_sections_catalog(book_dir: str, catalog: Dict[str, Any]) -> str:
    sections_path = os.path.join(book_dir, "sections.json")
    with open(sections_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return sections_path


def _ingest_manifest_units_book(
    book_dir: str,
    manifest: Dict[str, Any],
    *,
    chroma_path: str,
    chunks_col,
    units_col,
    embedder,
    purged: int,
) -> Dict[str, Any]:
    book_id = manifest["book_id"]
    title = manifest.get("title", book_id)
    pdf_offset = int(manifest.get("page_map", {}).get("pdf_page_offset", 0))

    reader = PdfReader(pdf_path(book_dir, manifest))
    total_pages = len(reader.pages)
    ranges = compute_ranges(manifest["units"], pdf_offset, total_pages)

    sections_catalog: Dict[str, Any] = {
        "book_id": book_id,
        "title": title,
        "units": [],
    }
    chunks_written = 0
    anchor_chunks = 0

    from .unit_detection import full_unit_id, normalize_manifest_unit_id

    for r in ranges:
        short_uid = normalize_manifest_unit_id(r["unit_id"], book_id)
        unit_id = full_unit_id(book_id, short_uid)
        unit_title = r["title"]
        start_book = int(r["start_book_page"])
        end_book = int(r.get("end_book_page") or r["end_pdf"] - pdf_offset + 1)

        units_col.upsert(
            ids=[unit_id],
            documents=[unit_title],
            metadatas=[
                sanitize_chroma_metadata(
                    {
                        "book_id": book_id,
                        "unit_id": unit_id,
                        "title": unit_title,
                        "start_pdf": r["start_pdf"],
                        "end_pdf": r["end_pdf"],
                        "start_book_page": r["start_book_page"],
                        "end_book_page": r.get("end_book_page"),
                        "start_page": r.get("start_page", r["start_book_page"]),
                        "end_page": r.get("end_page", r.get("end_book_page")),
                        "pdf_page_offset": pdf_offset,
                    }
                )
            ],
        )

        unit_data = build_unit_sections(reader, start_book, end_book, pdf_offset)
        sections_catalog["units"].append(
            {
                "unit_id": r["unit_id"],
                "full_unit_id": unit_id,
                "title": unit_title,
                "start_page": start_book,
                "end_page": end_book,
                "sections": unit_data["sections"],
            }
        )

        seen_text_keys: set = set()
        for page in unit_data["pages"]:
            book_page = page["book_page"]
            page_text = page["text"]
            if not page_text:
                continue
            for ci, chunk in enumerate(simple_chunk(page_text)):
                text_key = re.sub(r"\s+", " ", chunk.lower().strip())[:200]
                owner = f"{unit_id}:{book_page}:{text_key}"
                if owner in seen_text_keys:
                    continue
                seen_text_keys.add(owner)

                chunk_id = f"{unit_id}:p{book_page}:c{ci}"
                meta = {
                    "book_id": book_id,
                    "unit_id": unit_id,
                    "unit_title": unit_title,
                    "pdf_page": book_page,
                    "book_page": book_page,
                    "section_type": page["section_type"],
                    "section_title": page["section_title"],
                }
                _add_chunk(chunks_col, embedder, chunk_id=chunk_id, text=chunk, meta=meta)
                chunks_written += 1

        for section in unit_data["sections"]:
            section_type = section["section_type"]
            if section_type not in ANCHOR_SECTION_TYPES:
                continue
            combined = "\n\n".join(
                p["text"] for p in unit_data["pages"] if p["section_type"] == section_type and p["text"]
            ).strip()
            if len(combined) < 40:
                continue

            anchor = section_anchor_text(section_type, section["section_title"], combined)
            start_page = section["start_page"]
            chunk_id = f"{unit_id}:section_{section_type}:anchor"
            meta = {
                "book_id": book_id,
                "unit_id": unit_id,
                "unit_title": unit_title,
                "pdf_page": start_page,
                "book_page": start_page,
                "section_type": section_type,
                "section_title": section["section_title"],
                "is_section_anchor": True,
            }
            _add_chunk(
                chunks_col,
                embedder,
                chunk_id=chunk_id,
                text=anchor[:8000],
                meta=meta,
            )
            anchor_chunks += 1
            chunks_written += 1

    sections_path = _write_sections_catalog(book_dir, sections_catalog)

    return {
        "book_id": book_id,
        "title": title,
        "ingest_mode": "manifest_units",
        "units_ingested": len(ranges),
        "chunks_written": chunks_written,
        "section_anchors": anchor_chunks,
        "chunks_purged": purged,
        "sections_catalog": sections_path,
        "pdf_pages": total_pages,
    }


def ingest_book(book_dir: str, chroma_path: str = "chroma_db", *, purge: bool = True) -> Dict[str, Any]:
    """
    Ingest one book folder (manifest.json + PDF + optional lessons.json).

    Purges only this book's vectors when purge=True; never modifies unit plans,
    progress files, or generated lesson content.
    """
    manifest_path = os.path.join(book_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Missing manifest: {manifest_path}")

    manifest = load_manifest(book_dir)
    book_id = manifest["book_id"]
    pdf_file = pdf_path(book_dir, manifest)
    if not os.path.exists(pdf_file):
        raise FileNotFoundError(f"Missing PDF: {pdf_file}")

    client = get_chroma_client(chroma_path)
    units_col = client.get_or_create_collection("units")
    chunks_col = get_collection(client, "pdf_chunks")
    embedder = get_embedder(device="cpu")

    purged = purge_book_vectors(chunks_col, book_id, units_col=units_col) if purge else 0

    if os.path.exists(_lessons_path(book_dir)):
        result = _ingest_lessons_catalog_book(
            book_dir,
            manifest,
            chroma_path=chroma_path,
            chunks_col=chunks_col,
            units_col=units_col,
            embedder=embedder,
            purged=purged,
        )
    else:
        result = _ingest_manifest_units_book(
            book_dir,
            manifest,
            chroma_path=chroma_path,
            chunks_col=chunks_col,
            units_col=units_col,
            embedder=embedder,
            purged=purged,
        )

    try:
        from .lesson_content_mapping import sync_book_lesson_mappings

        sync_book_lesson_mappings(book_id, chroma_path=chroma_path)
    except Exception as exc:
        print(f"[ingest] lesson mapping sync failed for {book_id}: {exc}")

    return result


def ingest_book_by_key(
    book_key: str,
    books_root: str | None = None,
    chroma_path: str = "chroma_db",
    *,
    purge: bool = True,
) -> Dict[str, Any]:
    root = books_root or BOOKS_ROOT
    book_dir = resolve_book_dir(root, book_key)
    if not os.path.isdir(book_dir):
        raise FileNotFoundError(f"Book directory not found: {book_dir}")
    return ingest_book(book_dir, chroma_path=chroma_path, purge=purge)


def ingest_all_books(books_root: str, chroma_path: str = "chroma_db") -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for book_id in list_ingestible_books(books_root):
        book_dir = os.path.join(books_root, book_id)
        results.append(ingest_book(book_dir, chroma_path=chroma_path, purge=True))
    return results


def ingest_books(
    book_keys: Optional[List[str]] = None,
    books_root: str | None = None,
    chroma_path: str = "chroma_db",
) -> List[Dict[str, Any]]:
    """
    Ingest one or more books by key. None or ['all'] ingests every book with a manifest.
    """
    root = books_root or BOOKS_ROOT
    if not book_keys or book_keys == ["all"]:
        return ingest_all_books(root, chroma_path=chroma_path)

    results: List[Dict[str, Any]] = []
    for key in book_keys:
        results.append(ingest_book_by_key(key, books_root=root, chroma_path=chroma_path, purge=True))
    return results
