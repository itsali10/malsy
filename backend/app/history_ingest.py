"""
History-specific PDF ingestion — one lesson (and part) owns each chunk exclusively.

Chunk metadata includes lessonId and lessonPartId for strict RAG filtering.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader

from .db import get_chroma_client, get_collection
from .embeddings import get_embedder
from .history_lessons import (
    create_history_embedding_chunk_metadata,
    get_lesson_parts,
    is_non_teachable_history_content,
)
from .ingest_books import book_page_to_pdf_index, load_manifest, pdf_path, simple_chunk


def _lessons_path(book_dir: str) -> str:
    return os.path.join(book_dir, "lessons.json")


def _topic_hits(text: str, topics: List[str]) -> int:
    from .history_lessons import _topic_in_text

    return sum(1 for t in topics if _topic_in_text(t, text))


def _assign_part_index(
    chunk_text: str,
    lesson: Dict[str, Any],
) -> Optional[int]:
    """Topic-based assignment only. Returns None if chunk matches no part's ownedTopics."""
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


def _purge_history_chunks(chunks_col, book_id: str) -> int:
    removed = 0
    try:
        data = chunks_col.get(where={"book_id": book_id}, include=[])
        ids = data.get("ids") or []
        if ids:
            chunks_col.delete(ids=ids)
            removed = len(ids)
    except Exception:
        pass
    return removed


def create_history_embedding_chunks(
    lesson: Dict[str, Any],
    page_text: str,
    *,
    book_id: str,
    pdf_page: int,
    book_page: int,
) -> List[Dict[str, Any]]:
    """Split owned page text into teachable chunks with part ownership."""
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


def ingest_history_book(book_dir: str, chroma_path: str = "chroma_db") -> Dict[str, Any]:
    manifest = load_manifest(book_dir)
    book_id = manifest["book_id"]
    title = manifest.get("title", book_id)
    pdf_offset = int(manifest.get("page_map", {}).get("pdf_page_offset", 0))

    lessons_path = _lessons_path(book_dir)
    if not os.path.exists(lessons_path):
        raise FileNotFoundError(f"Missing lessons catalog: {lessons_path}")

    with open(lessons_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    lessons: List[Dict[str, Any]] = catalog.get("lessons") or []

    reader = PdfReader(pdf_path(book_dir, manifest))
    total_pages = len(reader.pages)

    client = get_chroma_client(chroma_path)
    units_col = client.get_or_create_collection("units")
    chunks_col = get_collection(client, "pdf_chunks")
    embedder = get_embedder(device="cpu")

    purged = _purge_history_chunks(chunks_col, book_id)
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
            metadatas=[{
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
            }],
        )

        for pdf_page in range(start_pdf, end_pdf + 1):
            page_text = (reader.pages[pdf_page].extract_text() or "").strip()
            book_page = pdf_page - pdf_offset + 1
            page_chunks = create_history_embedding_chunks(
                lesson,
                page_text,
                book_id=book_id,
                pdf_page=pdf_page,
                book_page=book_page,
            )
            for item in page_chunks:
                chunk = item["text"]
                meta = item["meta"]
                part_index = int(item["part_index"])
                text_key = re.sub(r"\s+", " ", chunk.lower().strip())[:200]
                owner = f"{meta['lesson_id']}:{text_key}"
                if owner in seen_text_keys:
                    continue
                seen_text_keys.add(owner)

                pid = meta["lesson_part_id"]
                chunk_id = f"{pid}:p{pdf_page}:c{meta['chunk_index']}"
                vec = embedder.embed_query(chunk)
                chunks_col.add(
                    ids=[chunk_id],
                    documents=[chunk],
                    embeddings=[vec],
                    metadatas=[meta],
                )
                chunks_written += 1

    return {
        "book_id": book_id,
        "title": title,
        "lessons_ingested": len(lessons),
        "chunks_written": chunks_written,
        "chunks_purged": purged,
        "pdf_pages": total_pages,
    }
