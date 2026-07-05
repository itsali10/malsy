"""Persisted lesson → textbook chunk mappings for reliable RAG retrieval."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .db import get_chroma_client, get_collection
from .storage import DATA_DIR, load_json, save_json
from .unit_detection import full_unit_id, normalize_manifest_unit_id

MAPPINGS_DIR = "lesson_mappings"


def _mapping_path(book_id: str) -> str:
    safe = (book_id or "").replace(":", "_")
    return f"{MAPPINGS_DIR}/{safe}.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _book_id_from_lesson(lesson_id: str) -> str:
    if ":" in lesson_id:
        return lesson_id.split(":")[0]
    return lesson_id


def _chroma_unit_ids_for_book(book_id: str, chroma_path: str = "chroma_db") -> List[str]:
    from .chapters_service import list_units

    return [
        str(u.get("unit_id") or "")
        for u in list_units(chroma_path)
        if u.get("book_id") == book_id and u.get("unit_id")
    ]


def _fetch_chunks_by_ids(
    chunk_ids: List[str],
    *,
    chroma_path: str = "chroma_db",
) -> List[Dict[str, Any]]:
    if not chunk_ids:
        return []
    client = get_chroma_client(chroma_path)
    col = get_collection(client, "pdf_chunks")
    try:
        res = col.get(ids=chunk_ids, include=["documents", "metadatas"])
    except Exception as exc:
        print(f"[lesson-mapping] chunk id fetch failed: {exc}")
        return []

    ids = res.get("ids") or []
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    by_id: Dict[str, Dict[str, Any]] = {}
    for i, cid in enumerate(ids):
        doc = docs[i] if i < len(docs) else ""
        if not doc or not str(doc).strip():
            continue
        meta = dict(metas[i] if i < len(metas) and metas[i] else {})
        meta["chunk_id"] = cid
        by_id[cid] = {"text": doc, "meta": meta}

    ordered: List[Dict[str, Any]] = []
    for cid in chunk_ids:
        if cid in by_id:
            ordered.append(by_id[cid])
    return ordered


def _chunks_for_unit_from_chroma(
    unit_id: str,
    *,
    chroma_path: str = "chroma_db",
) -> Tuple[List[str], List[Dict[str, Any]]]:
    client = get_chroma_client(chroma_path)
    col = get_collection(client, "pdf_chunks")
    try:
        res = col.get(where={"unit_id": unit_id}, include=["documents", "metadatas"])
    except Exception as exc:
        print(f"[lesson-mapping] unit chunk get failed for {unit_id}: {exc}")
        return [], []

    ids = list(res.get("ids") or [])
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    pairs: List[Tuple[str, Dict[str, Any]]] = []
    for i, cid in enumerate(ids):
        doc = docs[i] if i < len(docs) else ""
        if not doc or not str(doc).strip():
            continue
        meta = dict(metas[i] if i < len(metas) and metas[i] else {})
        meta["chunk_id"] = cid
        pairs.append((cid, {"text": doc, "meta": meta}))

    pairs.sort(key=lambda p: int(p[1]["meta"].get("pdf_page") or p[1]["meta"].get("book_page") or 0))
    chunk_ids = [p[0] for p in pairs]
    chunks = [p[1] for p in pairs]
    return chunk_ids, chunks


def _unit_metadata(lesson_id: str, chroma_path: str = "chroma_db") -> Dict[str, Any]:
    from .chapters_service import get_unit_content

    info = get_unit_content(lesson_id, chroma_path=chroma_path)
    if info.get("error"):
        return {}
    return info


def _infer_unit_label(short_unit_id: str) -> str:
    m = re.match(r"unit_(\d+)", short_unit_id or "", re.IGNORECASE)
    if m:
        return f"Unit {int(m.group(1))}"
    return ""


def _build_mapping_record(
    *,
    lesson_id: str,
    book_id: str,
    title: str,
    start_page: int,
    end_page: int,
    chunk_ids: List[str],
    source: str,
    unit_label: str = "",
) -> Dict[str, Any]:
    short = normalize_manifest_unit_id(lesson_id, book_id)
    return {
        "lesson_id": lesson_id,
        "unit_id": short,
        "title": title or short.replace("_", " ").title(),
        "unit": unit_label or _infer_unit_label(short),
        "start_page": int(start_page or 0),
        "end_page": int(end_page or start_page or 0),
        "chunk_ids": list(chunk_ids),
        "chunk_count": len(chunk_ids),
        "source": source,
        "updated_at": _now_iso(),
    }


def load_book_mappings(book_id: str) -> Dict[str, Any]:
    return load_json(_mapping_path(book_id), default={"book_id": book_id, "lessons": {}})


def save_book_mappings(book_id: str, data: Dict[str, Any]) -> None:
    data["book_id"] = book_id
    data["updated_at"] = _now_iso()
    save_json(_mapping_path(book_id), data)


def save_lesson_mapping(mapping: Dict[str, Any]) -> Dict[str, Any]:
    lesson_id = str(mapping.get("lesson_id") or "")
    book_id = _book_id_from_lesson(lesson_id)
    store = load_book_mappings(book_id)
    lessons = store.setdefault("lessons", {})
    lessons[lesson_id] = mapping
    save_book_mappings(book_id, store)
    return mapping


def get_lesson_mapping(lesson_id: str) -> Optional[Dict[str, Any]]:
    book_id = _book_id_from_lesson(lesson_id)
    store = load_book_mappings(book_id)
    return (store.get("lessons") or {}).get(lesson_id)


def resolve_lesson_id(
    chapter_id: str,
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    chroma_path: str = "chroma_db",
) -> str:
    """Resolve any chapter / plan id to the Chroma unit id that owns textbook chunks."""
    book_id = book_id or _book_id_from_lesson(chapter_id)
    chroma_units = set(_chroma_unit_ids_for_book(book_id, chroma_path))

    candidates: List[str] = []
    if chapter_id and ":" in chapter_id:
        candidates.append(chapter_id)
    if plan_unit:
        real = plan_unit.get("real_unit_id")
        short = plan_unit.get("unit_id")
        if real:
            candidates.append(str(real))
        if short:
            candidates.append(full_unit_id(book_id, str(short)))

    for cid in candidates:
        if cid in chroma_units:
            return cid

    short = chapter_id.split(":")[-1] if ":" in chapter_id else chapter_id
    full = full_unit_id(book_id, short)
    if full in chroma_units:
        return full

    # Legacy plan ids like unit_01 → match unit_01_lesson_NN when unambiguous.
    m = re.match(r"unit_(\d+)$", short, re.IGNORECASE)
    if m:
        n = int(m.group(1))
        lesson_pat = re.compile(rf"unit_{n:02d}_lesson_(\d+)$", re.IGNORECASE)
        matches = [u for u in chroma_units if lesson_pat.search(u.split(":")[-1])]
        if len(matches) == 1:
            return matches[0]
        if matches:
            for u in sorted(matches):
                if u.endswith(f"_lesson_{n:02d}"):
                    return u
            return sorted(matches)[0]

    # Lesson number only: science_g6 + lesson 3 card fallback unit_03
    if re.match(r"unit_\d+$", short, re.IGNORECASE):
        n = int(re.search(r"(\d+)$", short).group(1))
        by_lesson_num = [
            u for u in chroma_units if re.search(rf"_lesson_{n:02d}$", u.split(":")[-1], re.IGNORECASE)
        ]
        if len(by_lesson_num) == 1:
            return by_lesson_num[0]

    return full if ":" in full else full_unit_id(book_id, short)


def sync_book_lesson_mappings(book_id: str, *, chroma_path: str = "chroma_db") -> Dict[str, Any]:
    """Build lesson mappings from Chroma units + pdf_chunks metadata."""
    from .chapters_service import list_units

    store = load_book_mappings(book_id)
    lessons: Dict[str, Any] = store.setdefault("lessons", {})
    units = [u for u in list_units(chroma_path) if u.get("book_id") == book_id]

    for unit in units:
        lesson_id = str(unit.get("unit_id") or "")
        if not lesson_id:
            continue
        chunk_ids, _chunks = _chunks_for_unit_from_chroma(lesson_id, chroma_path=chroma_path)
        start_page = int(unit.get("start_page") or 0)
        end_page = int(unit.get("end_page") or start_page)
        short = normalize_manifest_unit_id(lesson_id, book_id)
        lessons[lesson_id] = _build_mapping_record(
            lesson_id=lesson_id,
            book_id=book_id,
            title=str(unit.get("title") or ""),
            start_page=start_page,
            end_page=end_page,
            chunk_ids=chunk_ids,
            source="chromadb_sync",
            unit_label=_infer_unit_label(short),
        )

    store["lessons"] = lessons
    store["synced_at"] = _now_iso()
    save_book_mappings(book_id, store)
    print(f"[lesson-mapping] synced {len(lessons)} lessons for {book_id}")
    return store


def plan_is_stale(book_id: str, plan: Dict[str, Any], *, chroma_path: str = "chroma_db") -> bool:
    """True when the saved plan unit ids do not match ingested Chroma lessons."""
    chroma_ids = set(_chroma_unit_ids_for_book(book_id, chroma_path))
    if not chroma_ids:
        return False
    units = plan.get("units") or []
    if len(units) != len(chroma_ids):
        return True
    for unit in units:
        real_id = str(unit.get("real_unit_id") or "")
        if not real_id or real_id not in chroma_ids:
            return True
    return False


def attach_mappings_to_plan_units(book_id: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Copy chunk_ids and page ranges from lesson mappings onto plan units."""
    mappings = load_book_mappings(book_id).get("lessons") or {}
    for unit in plan.get("units") or []:
        rid = str(unit.get("real_unit_id") or "")
        m = mappings.get(rid)
        if not m:
            continue
        unit["chunk_ids"] = m.get("chunk_ids") or []
        unit["start_page"] = m.get("start_page")
        unit["end_page"] = m.get("end_page")
    return plan


def refresh_plan_units_from_chroma(book_id: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Replace plan units with current Chroma lesson list; preserve plan metadata."""
    from .lesson_planner import build_chapter_plan

    fresh = build_chapter_plan(book_id)
    fresh_units = fresh.get("units") or []
    if not fresh_units:
        return plan

    old_by_short = {
        str(u.get("unit_id") or ""): u for u in (plan.get("units") or []) if u.get("unit_id")
    }
    merged_units: List[Dict[str, Any]] = []
    for fu in fresh_units:
        short = str(fu.get("unit_id") or "")
        old = old_by_short.get(short) or {}
        merged_units.append(
            {
                **fu,
                "title": old.get("title") or fu.get("title"),
                "keywords": old.get("keywords") or fu.get("keywords") or [],
                "module_key": old.get("module_key") or fu.get("module_key"),
                "minutes": old.get("minutes") or fu.get("minutes"),
            }
        )
    plan["units"] = merged_units
    return attach_mappings_to_plan_units(book_id, plan)


def validate_book_mappings(book_id: str) -> Dict[str, Any]:
    """Report whether every ingested lesson has mapped textbook chunks."""
    store = load_book_mappings(book_id)
    lessons = store.get("lessons") or {}
    missing: List[str] = []
    empty: List[str] = []
    for lesson_id, mapping in lessons.items():
        if not mapping.get("chunk_ids"):
            empty.append(lesson_id)
    chroma_ids = _chroma_unit_ids_for_book(book_id)
    for cid in chroma_ids:
        if cid not in lessons:
            missing.append(cid)
    ok = not missing and not empty
    return {
        "ok": ok,
        "lesson_count": len(chroma_ids),
        "mapped_count": len(lessons),
        "with_chunks": sum(1 for m in lessons.values() if m.get("chunk_ids")),
        "missing_lessons": missing,
        "lessons_without_chunks": empty,
    }


def ensure_book_ready_for_students(book_id: str, *, chroma_path: str = "chroma_db") -> Dict[str, Any]:
    """
    Sync lesson mappings and refresh stale plan unit ids after ingest/plan/publish.
    Called automatically for every processed book before student access.
    """
    from .canonical_plan_store import load_book_plan, save_book_plan

    store = sync_book_lesson_mappings(book_id, chroma_path=chroma_path)
    validation = validate_book_mappings(book_id)

    plan = load_book_plan(book_id)
    if plan and plan_is_stale(book_id, plan, chroma_path=chroma_path):
        print(f"[lesson-mapping] refreshing stale plan units for {book_id}")
        plan = refresh_plan_units_from_chroma(book_id, plan)
        save_book_plan(book_id, plan)
    elif plan:
        plan = attach_mappings_to_plan_units(book_id, plan)
        save_book_plan(book_id, plan)

    try:
        from .book_lessons_catalog import sync_lessons_catalog_from_manifest

        sync_lessons_catalog_from_manifest(book_id)
    except Exception as exc:
        print(f"[lesson-mapping] lessons catalog sync failed for {book_id}: {exc}")

    print(
        f"[lesson-mapping] ready check book={book_id} ok={validation['ok']} "
        f"lessons={validation['lesson_count']} with_chunks={validation['with_chunks']}"
    )
    return {"mappings": store, "validation": validation, "plan_refreshed": bool(plan)}


def ensure_lesson_mapping(
    chapter_id: str,
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    chroma_path: str = "chroma_db",
) -> Dict[str, Any]:
    """Return stored mapping; create from Chroma when missing."""
    book_id = book_id or _book_id_from_lesson(chapter_id)
    resolved_id = resolve_lesson_id(
        chapter_id, book_id=book_id, plan_unit=plan_unit, chroma_path=chroma_path
    )

    existing = get_lesson_mapping(resolved_id)
    if existing and existing.get("chunk_ids"):
        return existing

    store = load_book_mappings(book_id)
    if not (store.get("lessons") or {}):
        sync_book_lesson_mappings(book_id, chroma_path=chroma_path)
        existing = get_lesson_mapping(resolved_id)
        if existing and existing.get("chunk_ids"):
            return existing

    unit_info = _unit_metadata(resolved_id, chroma_path=chroma_path)
    chunk_ids, _chunks = _chunks_for_unit_from_chroma(resolved_id, chroma_path=chroma_path)
    title = (
        (plan_unit or {}).get("title")
        or unit_info.get("title")
        or resolved_id.split(":")[-1].replace("_", " ").title()
    )
    start_page = int(
        (existing or {}).get("start_page")
        or unit_info.get("start_page")
        or (plan_unit or {}).get("start_page")
        or 0
    )
    end_page = int(
        (existing or {}).get("end_page")
        or unit_info.get("end_page")
        or (plan_unit or {}).get("end_page")
        or start_page
    )

    source = "chromadb_sync" if chunk_ids else "mapping_pending"
    mapping = _build_mapping_record(
        lesson_id=resolved_id,
        book_id=book_id,
        title=str(title),
        start_page=start_page,
        end_page=end_page,
        chunk_ids=chunk_ids,
        source=source,
    )
    return save_lesson_mapping(mapping)


def _apply_page_part_filter(
    chunks: List[Dict[str, Any]],
    unit_part: Optional[int],
    unit_pages: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    from .language_lesson_sections import chunk_pdf_page, part_page_range

    if unit_part is None or not unit_pages:
        return chunks
    start_page = int(unit_pages.get("start_page") or 0)
    end_page = int(unit_pages.get("end_page") or 0)
    if start_page <= 0 or end_page <= 0:
        return chunks
    part_start, part_end = part_page_range(start_page, end_page, int(unit_part))
    filtered: List[Dict[str, Any]] = []
    for chunk in chunks:
        pdf_page = chunk_pdf_page(chunk)
        if pdf_page is None:
            continue
        if part_start <= pdf_page <= part_end:
            filtered.append(chunk)
    return filtered


def _retrieve_by_page_range(
    book_id: str,
    start_page: int,
    end_page: int,
    *,
    chroma_path: str = "chroma_db",
    max_chunks: int = 30,
) -> List[Dict[str, Any]]:
    if start_page <= 0 or end_page <= 0:
        return []
    client = get_chroma_client(chroma_path)
    col = get_collection(client, "pdf_chunks")
    try:
        res = col.get(where={"book_id": book_id}, include=["documents", "metadatas"])
    except Exception as exc:
        print(f"[lesson-mapping] page-range get failed: {exc}")
        return []

    chunks: List[Dict[str, Any]] = []
    ids = res.get("ids") or []
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    for i, doc in enumerate(docs):
        if not doc or not str(doc).strip():
            continue
        meta = dict(metas[i] if i < len(metas) and metas[i] else {})
        page = meta.get("pdf_page") or meta.get("book_page")
        if page is None:
            continue
        if int(start_page) <= int(page) <= int(end_page):
            meta["chunk_id"] = ids[i] if i < len(ids) else meta.get("chunk_id")
            chunks.append({"text": doc, "meta": meta})
    chunks.sort(key=lambda c: int(c["meta"].get("pdf_page") or c["meta"].get("book_page") or 0))
    return chunks[:max_chunks]


def log_lesson_retrieval_debug(
    *,
    lesson_id: str,
    mapping: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    source: str,
) -> None:
    text_len = sum(len(str(c.get("text") or "")) for c in chunks)
    chunk_ids = [
        str((c.get("meta") or {}).get("chunk_id") or "?") for c in chunks
    ]
    print(f"[lesson-retrieval] lesson_id={lesson_id}")
    print(f"[lesson-retrieval] lesson_title={mapping.get('title', '')!r}")
    print(
        f"[lesson-retrieval] page_range={mapping.get('start_page')}-{mapping.get('end_page')} "
        f"unit={mapping.get('unit', '')!r}"
    )
    print(f"[lesson-retrieval] source={source} chunk_count={len(chunks)} text_len={text_len}")
    print(f"[lesson-retrieval] chunk_ids={chunk_ids[:25]}")
    print(f"[lesson-retrieval] mapped_chunk_ids={list(mapping.get('chunk_ids') or [])[:25]}")
    if chunks:
        preview = str(chunks[0].get("text") or "")[:200].replace("\n", " ")
        print(f"[lesson-retrieval] first_chunk_preview={preview!r}")


def retrieve_chunks_for_lesson(
    chapter_id: str,
    query: str = "",
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    unit_part: Optional[int] = None,
    unit_pages: Optional[Dict[str, Any]] = None,
    k: int = 20,
    chroma_path: str = "chroma_db",
) -> Tuple[List[Dict[str, Any]], str, Dict[str, Any]]:
    """
    Mapping-first textbook chunk retrieval.

    Priority:
    1. Stored lesson mapping chunk_ids
    2. Chroma unit_id metadata (same lesson)
    3. Page-range fallback (title/pages from mapping)
    4. Semantic search (only when no mapping exists)
    """
    from .lesson_graph import retrieve_for_item

    book_id = book_id or _book_id_from_lesson(chapter_id)
    mapping = ensure_lesson_mapping(
        chapter_id, book_id=book_id, plan_unit=plan_unit, chroma_path=chroma_path
    )
    lesson_id = str(mapping.get("lesson_id") or resolve_lesson_id(chapter_id, book_id=book_id, plan_unit=plan_unit))
    has_mapping = bool(mapping.get("chunk_ids"))

    pages = dict(unit_pages or {})
    if not pages.get("start_page") and mapping.get("start_page"):
        pages["start_page"] = mapping["start_page"]
    if not pages.get("end_page") and mapping.get("end_page"):
        pages["end_page"] = mapping["end_page"]

    chunks: List[Dict[str, Any]] = []
    source = "insufficient_textbook"

    if has_mapping:
        chunks = _fetch_chunks_by_ids(list(mapping["chunk_ids"]), chroma_path=chroma_path)
        if chunks:
            source = "stored_mapping"

    if not chunks:
        _ids, chunks = _chunks_for_unit_from_chroma(lesson_id, chroma_path=chroma_path)
        if chunks:
            source = "stored_mapping_unit_metadata"
            if _ids:
                mapping["chunk_ids"] = _ids
                mapping["chunk_count"] = len(_ids)
                mapping["source"] = source
                save_lesson_mapping(mapping)

    if not chunks and mapping.get("start_page") and mapping.get("end_page"):
        chunks = _retrieve_by_page_range(
            book_id,
            int(mapping["start_page"]),
            int(mapping["end_page"]),
            chroma_path=chroma_path,
            max_chunks=k,
        )
        if chunks:
            source = "fallback_page_range"
            mapping["chunk_ids"] = [
                str(c.get("meta", {}).get("chunk_id") or "") for c in chunks if c.get("meta", {}).get("chunk_id")
            ]
            mapping["source"] = source
            save_lesson_mapping(mapping)

    if not chunks and not has_mapping and query:
        chunks = retrieve_for_item(lesson_id, query, k=k, unit_part=unit_part, unit_pages=pages)
        if chunks:
            source = "fallback_semantic_search"
            mapping["chunk_ids"] = [str(c.get("meta", {}).get("chunk_id") or "") for c in chunks]
            mapping["source"] = source
            save_lesson_mapping(mapping)

    all_chunks = list(chunks)
    if unit_part is not None and pages:
        filtered = _apply_page_part_filter(chunks, unit_part, pages)
        if filtered:
            chunks = filtered
        else:
            from .language_lesson_sections import part_page_range

            ps, pe = part_page_range(
                int(pages.get("start_page") or 0),
                int(pages.get("end_page") or 0),
                int(unit_part),
            )
            if ps > 0 and pe >= ps:
                part_chunks = _retrieve_by_page_range(
                    book_id, ps, pe, chroma_path=chroma_path, max_chunks=k
                )
                if part_chunks:
                    chunks = part_chunks
                    source = f"{source}_part{unit_part}_pages"

    chunks = chunks[:k]
    log_lesson_retrieval_debug(
        lesson_id=lesson_id, mapping=mapping, chunks=chunks, source=source
    )
    return chunks, source, mapping


def session_unit_from_mapping(
    chapter_id: str,
    *,
    book_id: str,
    plan_unit: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the teaching unit payload for /session/start from lesson mapping."""
    mapping = ensure_lesson_mapping(chapter_id, book_id=book_id, plan_unit=plan_unit)
    lesson_id = str(mapping["lesson_id"])
    short = str(mapping.get("unit_id") or lesson_id.split(":")[-1])
    return {
        "unit_id": short,
        "real_unit_id": lesson_id,
        "title": mapping.get("title") or (plan_unit or {}).get("title") or short,
        "keywords": (plan_unit or {}).get("keywords") or [],
        "start_page": mapping.get("start_page"),
        "end_page": mapping.get("end_page"),
        "lesson_mapping": mapping,
    }


def build_unit_for_teaching(
    chapter_id: str,
    *,
    book_id: str,
    plan_unit: Optional[Dict[str, Any]] = None,
    unit_part: int = 0,
) -> tuple[Dict[str, Any], str]:
    """Resolve lesson mapping and return (unit_for_teaching, graph_chapter_id)."""
    mapped = session_unit_from_mapping(chapter_id, book_id=book_id, plan_unit=plan_unit)
    mapping = mapped.get("lesson_mapping") or ensure_lesson_mapping(
        chapter_id, book_id=book_id, plan_unit=plan_unit
    )
    lesson_id = str(mapping.get("lesson_id") or mapped.get("real_unit_id"))
    unit_pages = {
        "start_page": int(mapping.get("start_page") or mapped.get("start_page") or 0),
        "end_page": int(mapping.get("end_page") or mapped.get("end_page") or 0),
    }
    if unit_pages["start_page"] <= 0 or unit_pages["end_page"] <= 0:
        unit_info = _unit_metadata(lesson_id)
        if unit_info and "error" not in unit_info:
            unit_pages = {
                "start_page": int(unit_info.get("start_page") or 0),
                "end_page": int(unit_info.get("end_page") or 0),
            }
    unit_for_teaching = {
        **mapped,
        "unit_id": lesson_id,
        "real_unit_id": lesson_id,
        "unit_part": int(unit_part),
        "unit_pages": unit_pages,
        "lesson_mapping": mapping,
    }
    graph_chapter_id = lesson_id if ":" in lesson_id else chapter_id
    return unit_for_teaching, graph_chapter_id
