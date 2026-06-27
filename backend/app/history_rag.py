"""
Lesson-scoped RAG for History (history_g6).

This History book is small: ONE textbook section == ONE lesson.
There are NO lesson parts. Every chunk is owned by exactly one lesson and
retrieval NEVER crosses lesson boundaries.

Retrieval is strictly filtered by lessonId (== unitId for this book):
    subject = "history", lessonId = selectedLessonId.
Any chunk whose lessonId differs from the selected lesson is rejected.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .db import get_chroma_client, get_collection
from .embeddings import get_embedder
from .history_lessons import (
    get_lesson_by_unit_id,
    normalize_lesson_id,
    validate_history_rag_retrieval,
)

_embedder = None


class HistoryRagError(Exception):
    """Raised when History RAG cannot find scoped chunks for a lesson."""


def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder


def _chunk_lesson_id(meta: Dict[str, Any]) -> str:
    raw = meta.get("lesson_id") or meta.get("lessonId") or meta.get("unit_id") or ""
    return normalize_lesson_id(str(raw))


def _query_lesson_chunks(
    col,
    *,
    lesson_id: str,
    query_embedding: List[float],
    k: int,
) -> List[Dict[str, Any]]:
    """Query ALL chunks for ONE lesson, filtered strictly by lessonId."""
    chunks: List[Dict[str, Any]] = []
    seen_ids: set = set()
    for field in ("lesson_id", "lessonId", "unit_id"):
        try:
            res = col.query(
                query_embeddings=[query_embedding],
                n_results=k,
                where={field: lesson_id},
            )
        except Exception:
            continue
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        ids = (res.get("ids") or [[]])[0]
        for i in range(len(docs)):
            cid = ids[i] if i < len(ids) else f"{i}:{docs[i][:40]}"
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            meta = metas[i] if i < len(metas) else {}
            # Strict ownership: only keep chunks that belong to this lesson.
            if _chunk_lesson_id(meta) != lesson_id:
                continue
            chunks.append({"text": docs[i], "meta": meta})
    return chunks


def retrieve_history_chunks(
    lesson_id: str,
    query: str,
    *,
    k: int = 12,
    part_index: Optional[int] = None,  # kept for compatibility; ignored (no parts)
    lesson: Optional[Dict[str, Any]] = None,
    chroma_path: str = "chroma_db",
    strict: bool = True,
) -> List[Dict[str, Any]]:
    """
    Retrieve chunks for ONE history lesson, strictly filtered by lessonId.

    There are no parts: the whole lesson's chunks are retrieved together.
    Raises HistoryRagError when retrieved chunks do not all belong to the
    selected lesson, or (when strict) when no chunks are found.
    """
    lid = normalize_lesson_id(lesson_id)
    if lesson is None:
        lesson = get_lesson_by_unit_id(lid)

    selected_title = (lesson or {}).get("title", "") if lesson else ""

    client = get_chroma_client(chroma_path)
    col = get_collection(client, "pdf_chunks")
    qv = _get_embedder().embed_query(query or selected_title or "lesson content facts")

    chunks = _query_lesson_chunks(col, lesson_id=lid, query_embedding=qv, k=max(k * 2, k))
    chunks.sort(key=lambda c: (c["meta"].get("pdf_page", 0), c["meta"].get("chunk_index", 0)))
    chunks = chunks[:k]

    # ---- Debug logs (required) ----
    retrieved_lesson_ids = sorted({_chunk_lesson_id(c["meta"]) for c in chunks})
    retrieved_pages = [c["meta"].get("pdf_page", c["meta"].get("pageNumber", "?")) for c in chunks]
    retrieved_sections = sorted({
        str(c["meta"].get("sectionTitle") or c["meta"].get("lesson_title") or "")
        for c in chunks
    })
    print(
        "[history-rag] "
        f"selectedLessonId={lid} selectedLessonTitle={selected_title!r} "
        f"retrievedChunkLessonIds={retrieved_lesson_ids} "
        f"retrievedChunkPageNumbers={retrieved_pages} "
        f"retrievedChunkSectionTitles={retrieved_sections}"
    )

    # ---- Validation: every chunk must belong to the selected lesson ----
    foreign = [lid2 for lid2 in retrieved_lesson_ids if lid2 and lid2 != lid]
    if foreign:
        raise HistoryRagError(
            "History RAG retrieval error: retrieved chunks do not match selected lesson "
            f"(selected={lid}, found={foreign})"
        )

    validation = validate_history_rag_retrieval(chunks, lid, None)
    if strict and not chunks:
        msg = validation.get("errors") or [f"No chunks for lesson {lid}"]
        raise HistoryRagError(
            "History RAG retrieval error: retrieved chunks do not match selected lesson "
            f"({'; '.join(msg)})"
        )

    return chunks


def get_lesson_chunk_text(
    lesson_id: str,
    *,
    part_index: Optional[int] = None,  # ignored; whole lesson is always used
    max_chars: int = 6000,
    chroma_path: str = "chroma_db",
) -> str:
    """Return the textbook excerpt for ONE whole lesson (no parts)."""
    lesson = get_lesson_by_unit_id(normalize_lesson_id(lesson_id))

    chunks = retrieve_history_chunks(
        lesson_id,
        "textbook content for this lesson",
        k=50,
        lesson=lesson,
        chroma_path=chroma_path,
        strict=True,
    )

    out: List[str] = []
    total = 0
    for c in chunks:
        t = (c.get("text") or "").strip()
        if not t:
            continue
        if total + len(t) > max_chars:
            out.append(t[: max_chars - total])
            break
        out.append(t)
        total += len(t) + 2
    return "\n\n".join(out)
