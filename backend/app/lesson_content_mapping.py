"""Persisted lesson → textbook chunk mappings for reliable RAG retrieval."""

from __future__ import annotations

import json
import os
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

    if (plan_unit or {}).get("title"):
        lesson_info = resolve_lesson_for_planning(book_id, chapter_id, plan_unit)
        chapter_id = str(lesson_info["lesson_id"])
        plan_unit = {
            **(plan_unit or {}),
            "unit_id": lesson_info["unit_id"],
            "real_unit_id": lesson_info["lesson_id"],
            "title": lesson_info["title"],
            "start_page": lesson_info["start_page"],
            "end_page": lesson_info["end_page"],
        }

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
    lesson_id: str = "",
    chroma_path: str = "chroma_db",
    max_chunks: int = 30,
) -> List[Dict[str, Any]]:
    if start_page <= 0 or end_page <= 0:
        return []
    client = get_chroma_client(chroma_path)
    col = get_collection(client, "pdf_chunks")
    where: Dict[str, Any] = {"book_id": book_id}
    if lesson_id:
        where = {"book_id": book_id, "unit_id": lesson_id}
    try:
        res = col.get(where=where, include=["documents", "metadatas"])
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
        page = _chunk_book_page({"meta": meta, "text": doc})
        if page is None:
            continue
        if int(start_page) <= int(page) <= int(end_page):
            meta["chunk_id"] = ids[i] if i < len(ids) else meta.get("chunk_id")
            chunks.append({"text": doc, "meta": meta})
    chunks.sort(key=lambda c: _chunk_book_page(c) or 0)
    return chunks[:max_chunks]


def _chunk_book_page(chunk: Dict[str, Any]) -> Optional[int]:
    meta = chunk.get("meta") or {}
    page = meta.get("book_page") or meta.get("pdf_page")
    if page is None:
        return None
    try:
        return int(page)
    except (TypeError, ValueError):
        return None


def _filter_chunks_to_page_range(
    chunks: List[Dict[str, Any]],
    start_page: int,
    end_page: int,
) -> List[Dict[str, Any]]:
    """Keep only chunks whose book/pdf page falls within the lesson range."""
    if start_page <= 0 or end_page <= 0:
        return list(chunks)
    filtered = [
        c
        for c in chunks
        if _chunk_book_page(c) is not None and start_page <= _chunk_book_page(c) <= end_page
    ]
    return filtered


def _normalize_lesson_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


def find_manifest_lesson_by_title(book_id: str, title: str) -> Optional[Dict[str, Any]]:
    """Locate a manifest lesson row by exact title (source of truth for English books)."""
    target = _normalize_lesson_title(title)
    if not target:
        return None
    lessons = list_manifest_lessons(book_id)
    for les in lessons:
        if _normalize_lesson_title(les.get("title") or "") == target:
            return dict(les)
    for les in lessons:
        row_title = _normalize_lesson_title(les.get("title") or "")
        if row_title and (row_title.startswith(target) or target.startswith(row_title)):
            return dict(les)
    return None


def compute_strict_lesson_bounds(
    lesson_row: Dict[str, Any],
    all_lessons: List[Dict[str, Any]],
) -> Tuple[int, int, Optional[Dict[str, Any]]]:
    """
    Derive inclusive start/end pages for one lesson.
    End page never crosses into the next lesson's start page.
    """
    lessons = sorted(all_lessons, key=lambda l: int(l.get("start_page") or 0))
    short_id = str(lesson_row.get("unit_id") or "")
    idx = next(
        (i for i, les in enumerate(lessons) if str(les.get("unit_id") or "") == short_id),
        -1,
    )
    start_page = int(lesson_row.get("start_page") or 0)
    manifest_end = int(lesson_row.get("end_page") or start_page)
    next_lesson = lessons[idx + 1] if 0 <= idx < len(lessons) - 1 else None
    if next_lesson:
        next_start = int(next_lesson.get("start_page") or 0)
        if next_start > start_page:
            end_page = min(manifest_end, next_start - 1)
        else:
            end_page = manifest_end
    else:
        end_page = manifest_end
    end_page = max(start_page, end_page)
    return start_page, end_page, next_lesson


def _next_lesson_text_markers(next_lesson: Optional[Dict[str, Any]]) -> List[str]:
    if not next_lesson:
        return []
    markers: List[str] = []
    title = (next_lesson.get("title") or "").strip()
    if title and len(title) >= 4:
        markers.append(title)
    unit_id = str(next_lesson.get("unit_id") or "")
    m = re.search(r"unit_(\d+)$", unit_id, re.IGNORECASE)
    if m:
        n = int(m.group(1))
        markers.extend(
            [
                f"Lesson {n}:",
                f"Lesson {n} :",
                f"UNIT {n}",
                f"Unit {n}",
            ]
        )
    seen: set[str] = set()
    out: List[str] = []
    for marker in markers:
        key = marker.lower()
        if key not in seen:
            seen.add(key)
            out.append(marker)
    return out


def truncate_text_at_next_lesson(text: str, markers: List[str]) -> Tuple[str, bool]:
    """Cut text before the earliest next-lesson heading marker."""
    if not text or not markers:
        return text, False
    lower = text.lower()
    cut_at: Optional[int] = None
    for marker in markers:
        if not marker or len(marker) < 4:
            continue
        pos = lower.find(marker.lower())
        if pos > 0 and (cut_at is None or pos < cut_at):
            cut_at = pos
    if cut_at is None:
        return text, False
    return text[:cut_at].rstrip(), True


def truncate_chunks_at_next_lesson(
    chunks: List[Dict[str, Any]],
    next_lesson: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Drop chunks after the next lesson heading; truncate the boundary chunk."""
    markers = _next_lesson_text_markers(next_lesson)
    if not markers or not chunks:
        return chunks
    next_start = int((next_lesson or {}).get("start_page") or 0)
    out: List[Dict[str, Any]] = []
    for chunk in chunks:
        book_page = _chunk_book_page(chunk)
        # TOC / overview pages before the next lesson may mention its title — keep them.
        if next_start > 0 and book_page is not None and book_page < next_start:
            out.append(chunk)
            continue
        text = str(chunk.get("text") or "")
        truncated, hit = truncate_text_at_next_lesson(text, markers)
        if truncated.strip():
            out.append({**chunk, "text": truncated})
        if hit:
            break
    return out if out else chunks


def detect_english_section_headings(chunks: List[Dict[str, Any]]) -> List[str]:
    """Return English section types present in extracted lesson text."""
    from .english_section_segmentation import segment_chunks_into_sections

    segmented = segment_chunks_into_sections(chunks)
    found: List[str] = []
    seen: set[str] = set()
    for section_type in segmented:
        if section_type not in seen:
            seen.add(section_type)
            found.append(section_type)
    return found


def extract_headings_from_chunks(chunks: List[Dict[str, Any]]) -> List[str]:
    """Human-readable section headings detected in lesson excerpts."""
    from .book_sections import SECTION_LABELS

    headings: List[str] = []
    seen: set[str] = set()
    for section_type in detect_english_section_headings(chunks):
        label = SECTION_LABELS.get(section_type, section_type.replace("_", " ").title())
        key = label.lower()
        if key not in seen:
            seen.add(key)
            headings.append(label)
    return headings


_ENGLISH_SECTION_PLAN_TYPES: Dict[str, frozenset[str]] = {
    "vocab": frozenset({"vocab", "vocabulary", "unit_opening"}),
    "reading": frozenset({"reading", "comprehension", "discussion", "discussion_questions"}),
    "grammar": frozenset({"grammar"}),
    "listening": frozenset({"listening"}),
    "speaking": frozenset({"speaking", "pronunciation"}),
    "writing": frozenset({"writing", "wrap_up"}),
    "word_study": frozenset({"vocab", "vocabulary"}),
    "exercises": frozenset({"exercises", "visual", "visual_elements"}),
    "other": frozenset({"other", "unit_opening", "wrap_up"}),
}


def filter_english_plan_to_detected_sections(
    plan: Dict[str, Any],
    detected_sections: List[str],
) -> Dict[str, Any]:
    """Keep only plan items whose type matches sections found in the lesson text."""
    items = list(plan.get("items") or [])
    if not items or not detected_sections:
        return plan

    allowed_types: set[str] = set()
    for section_type in detected_sections:
        allowed_types.update(_ENGLISH_SECTION_PLAN_TYPES.get(section_type, frozenset({section_type})))

    # Always allow review/summary when any instructional section exists
    if detected_sections:
        allowed_types.update({"wrap_up", "other", "exercises", "visual", "visual_elements", "discussion"})

    filtered: List[Dict[str, Any]] = []
    for item in items:
        item_type = str(item.get("type") or "").lower()
        item_id = str(item.get("id") or "").lower()
        if item_type in allowed_types:
            filtered.append(item)
            continue
        if any(item_id.startswith(t) or t in item_id for t in allowed_types):
            filtered.append(item)

    if not filtered:
        return plan
    out = dict(plan)
    out["items"] = filtered
    return out


def resolve_lesson_for_planning(
    book_id: str,
    chapter_id: str,
    plan_unit: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Resolve lesson identity for plan generation.
    Lesson title is the source of truth; page bounds never include the next lesson.
    """
    title = str((plan_unit or {}).get("title") or "").strip()
    all_lessons = list_manifest_lessons(book_id)
    lesson_row: Optional[Dict[str, Any]] = None

    if title:
        lesson_row = find_manifest_lesson_by_title(book_id, title)

    if not lesson_row and chapter_id:
        short = normalize_manifest_unit_id(chapter_id, book_id)
        for les in all_lessons:
            if normalize_manifest_unit_id(les.get("unit_id") or "", book_id) == short:
                lesson_row = dict(les)
                break

    if not lesson_row and plan_unit:
        lesson_row = {
            "unit_id": str(plan_unit.get("unit_id") or "unit_01"),
            "title": title or str(plan_unit.get("unit_id") or "Lesson"),
            "start_page": int(plan_unit.get("start_page") or 0),
            "end_page": int(plan_unit.get("end_page") or plan_unit.get("start_page") or 0),
        }

    if not lesson_row:
        lesson_row = {
            "unit_id": "unit_01",
            "title": title or "Lesson",
            "start_page": int((plan_unit or {}).get("start_page") or 0),
            "end_page": int((plan_unit or {}).get("end_page") or 0),
        }

    if title and not lesson_row.get("title"):
        lesson_row["title"] = title

    start_page, end_page, next_lesson = compute_strict_lesson_bounds(lesson_row, all_lessons)
    short = normalize_manifest_unit_id(str(lesson_row.get("unit_id") or ""), book_id)
    lesson_id = full_unit_id(book_id, short)
    resolved_title = str(lesson_row.get("title") or title or short)

    previous_lesson: Optional[Dict[str, Any]] = None
    lessons_sorted = sorted(all_lessons, key=lambda l: int(l.get("start_page") or 0))
    for i, les in enumerate(lessons_sorted):
        if str(les.get("unit_id") or "") == short:
            if i > 0:
                previous_lesson = dict(lessons_sorted[i - 1])
            break

    return {
        "lesson_id": lesson_id,
        "unit_id": short,
        "title": resolved_title,
        "start_page": start_page,
        "end_page": end_page,
        "next_lesson": next_lesson,
        "previous_lesson": previous_lesson,
        "lesson_row": lesson_row,
    }


def log_lesson_plan_extraction_debug(
    *,
    lesson_info: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    source: str,
    extracted_headings: Optional[List[str]] = None,
) -> None:
    """Debug logging for lesson plan extraction verification."""
    pages = sorted(
        {
            p
            for p in (_chunk_book_page(c) for c in chunks)
            if p is not None
        }
    )
    next_lesson = lesson_info.get("next_lesson") or {}
    headings = extracted_headings if extracted_headings is not None else extract_headings_from_chunks(chunks)
    print("[lesson-plan-extract] Current lesson:", lesson_info.get("title", ""))
    print("[lesson-plan-extract] Start page:", lesson_info.get("start_page"))
    print("[lesson-plan-extract] End page:", lesson_info.get("end_page"))
    print("[lesson-plan-extract] Extracted headings:", headings)
    print(
        "[lesson-plan-extract] Next detected lesson:",
        next_lesson.get("title") or "(none)",
        f"(starts page {next_lesson.get('start_page')})" if next_lesson.get("start_page") else "",
    )
    print("[lesson-plan-extract] Pages extracted:", pages)
    print(
        f"[lesson-plan-extract] lesson_id={lesson_info.get('lesson_id')} "
        f"source={source} chunk_count={len(chunks)} pages_count={len(pages)}"
    )


def list_manifest_lessons(book_id: str) -> List[Dict[str, Any]]:
    """Lesson rows from manifest: unit_id, title, start_page, end_page."""
    from .book_registry import book_dir

    path = os.path.join(book_dir(book_id), "manifest.json")
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    lessons: List[Dict[str, Any]] = []
    for row in manifest.get("units") or []:
        short = str(row.get("unit_id") or "").strip()
        if not short:
            continue
        lessons.append(
            {
                "unit_id": short,
                "title": str(row.get("title") or "").strip(),
                "start_page": int(row.get("start_page") or 0),
                "end_page": int(row.get("end_page") or row.get("start_page") or 0),
            }
        )
    return lessons


def forbidden_lesson_titles(book_id: str, current_unit_id: str) -> List[str]:
    """Titles and unit labels from other lessons — used to validate plan scope."""
    from .unit_detection import normalize_manifest_unit_id

    current = normalize_manifest_unit_id(current_unit_id, book_id)
    current_prefix_match = re.match(r"^(unit_\d+)", current, re.IGNORECASE)
    current_prefix = current_prefix_match.group(1).lower() if current_prefix_match else ""

    forbidden: List[str] = []
    seen: set[str] = set()
    for les in list_manifest_lessons(book_id):
        short = normalize_manifest_unit_id(les["unit_id"], book_id)
        if short == current:
            continue
        title = (les.get("title") or "").strip()
        if title and title.lower() not in seen:
            forbidden.append(title)
            seen.add(title.lower())
        prefix_match = re.match(r"^unit_(\d+)", short, re.IGNORECASE)
        if prefix_match:
            n = int(prefix_match.group(1))
            prefix = prefix_match.group(0).lower()
            if prefix != current_prefix:
                for label in (f"Unit {n}", f"Unit {n:02d}", f"UNIT {n}"):
                    key = label.lower()
                    if key not in seen:
                        forbidden.append(label)
                        seen.add(key)
    for noise in ("Table of Contents", "Contents", "Index", "Appendix"):
        if noise.lower() not in seen:
            forbidden.append(noise)
            seen.add(noise.lower())
    return forbidden


def validate_plan_lesson_scope(
    plan: Dict[str, Any],
    *,
    lesson_title: str,
    forbidden_titles: List[str],
) -> Dict[str, Any]:
    """Drop checklist items that reference other lessons, units, or TOC noise."""
    items = list(plan.get("items") or [])
    if not items:
        return plan

    lesson_lower = (lesson_title or "").strip().lower()
    blocked = [
        t.strip().lower()
        for t in forbidden_titles
        if t and t.strip().lower() != lesson_lower and len(t.strip()) >= 3
    ]
    toc_markers = ("table of contents", "contents page", "unit overview for unit")

    cleaned: List[Dict[str, Any]] = []
    for item in items:
        title = str(item.get("title") or "")
        blob = f"{title} {' '.join(item.get('keywords') or [])}".lower()
        if any(marker in blob for marker in toc_markers):
            continue
        if any(block in blob for block in blocked):
            continue
        cleaned.append(item)

    out = dict(plan)
    out["items"] = cleaned if cleaned else items
    out["unit_title"] = lesson_title or plan.get("unit_title")
    return out


LESSON_EXTRACTION_FAILED_MESSAGE = (
    "Lesson extraction failed. Please reprocess the book."
)
MIN_LESSON_TEACHING_CHARS = 200

_PAGE_ONLY_LINE = re.compile(r"^\s*\d{1,3}\s*$")
_TOC_LINE_RE = re.compile(r"table\s+of\s+contents", re.IGNORECASE)
_TOC_LISTING_LINE_RE = re.compile(r"Lesson\s+\d+\s*:.*?\.{4,}\s*\d+", re.IGNORECASE)


def _is_toc_listing_chunk(text: str) -> bool:
    """True when a chunk is mostly table-of-contents listings, not lesson body."""
    t = (text or "").strip()
    if not t:
        return True
    lower = t.lower()
    if "table of contents" in lower:
        return True
    dotted = sum(1 for line in t.splitlines() if re.search(r"\.{4,}\s*\d+\s*$", line.strip()))
    if dotted >= 2:
        return True
    if _TOC_LISTING_LINE_RE.search(t) and dotted >= 1:
        return True
    return False


def clean_lesson_page_text(text: str) -> str:
    """Remove isolated page numbers, TOC lines, and excess blank lines."""
    if not text:
        return ""
    cleaned_lines: List[str] = []
    for line in str(text).splitlines():
        stripped = line.strip()
        if not stripped:
            if cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")
            continue
        if _PAGE_ONLY_LINE.match(stripped):
            continue
        if _TOC_LINE_RE.search(stripped) and len(stripped) < 80:
            continue
        cleaned_lines.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(cleaned_lines)).strip()


def _sanitize_lesson_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for chunk in chunks:
        text = clean_lesson_page_text(str(chunk.get("text") or ""))
        if len(text) < 15:
            continue
        if _is_toc_listing_chunk(text):
            continue
        out.append({**chunk, "text": text})
    return out


def _topic_words(title: str) -> List[str]:
    stop = {"what", "why", "how", "the", "and", "for", "with", "from", "that", "this", "does", "are", "was", "were"}
    words = [w.lower() for w in re.findall(r"[A-Za-z']{4,}", title or "")]
    return [w for w in words if w not in stop]


def validate_lesson_extraction_for_teaching(
    *,
    lesson_title: str,
    chunks: List[Dict[str, Any]],
    next_lesson: Optional[Dict[str, Any]] = None,
    previous_lesson: Optional[Dict[str, Any]] = None,
    min_chars: Optional[int] = None,
) -> Dict[str, Any]:
    """Validate scoped textbook extraction before teaching or quiz generation."""
    combined = "\n".join(str(c.get("text") or "") for c in chunks).strip()
    combined_lower = combined.lower()
    errors: List[str] = []
    threshold = int(min_chars if min_chars is not None else MIN_LESSON_TEACHING_CHARS)

    if len(combined) < threshold:
        errors.append(f"extracted text too short ({len(combined)} chars)")

    title_norm = _normalize_lesson_title(lesson_title)
    is_part_slice = min_chars is not None and min_chars < MIN_LESSON_TEACHING_CHARS
    if not is_part_slice and title_norm and title_norm not in combined_lower:
        topic_hits = [w for w in _topic_words(lesson_title) if w in combined_lower]
        if _topic_words(lesson_title) and not topic_hits:
            errors.append("extracted text does not match the selected lesson title")

    next_title = (next_lesson or {}).get("title") or ""
    next_title_lower = str(next_title).strip().lower()
    next_start = int((next_lesson or {}).get("start_page") or 0)
    next_title_in_text = False
    if next_title_lower and next_title_lower in combined_lower:
        # Allow mentions only on pages before the next lesson starts (e.g. TOC).
        for chunk in chunks:
            page = _chunk_book_page(chunk)
            text_lower = str(chunk.get("text") or "").lower()
            if next_title_lower in text_lower and (page is None or page >= next_start):
                next_title_in_text = True
                break
    if next_title_in_text:
        errors.append(f"next lesson title appears in extracted text: {next_title!r}")

    prev_title = (previous_lesson or {}).get("title") or ""
    prev_title_lower = str(prev_title).strip().lower()
    if prev_title_lower and prev_title_lower in combined_lower:
        if prev_title_lower not in (lesson_title or "").lower():
            errors.append(f"previous lesson title appears in extracted text: {prev_title!r}")

    topic_hits = [w for w in _topic_words(lesson_title) if w in combined_lower]

    return {
        "ok": not errors,
        "errors": errors,
        "combined_text": combined,
        "combined_length": len(combined),
        "next_lesson_title": next_title,
        "next_lesson_title_in_text": next_title_in_text,
        "previous_lesson_title": prev_title,
        "topic_hits": topic_hits,
    }


def validate_generated_teaching_text(
    generated_text: str,
    *,
    lesson_title: str,
    source_text: str,
    next_lesson_title: str = "",
) -> Dict[str, Any]:
    """Ensure generated teaching references the current lesson, not the next one."""
    text = (generated_text or "").strip()
    lower = text.lower()
    errors: List[str] = []

    if len(text) < 80:
        errors.append("generated teaching text too short")

    if next_lesson_title and next_lesson_title.lower() in lower:
        if next_lesson_title.lower() not in (lesson_title or "").lower():
            errors.append("generated text references the next lesson")

    topic_hits = [w for w in _topic_words(lesson_title) if w in lower]
    source_hits = [w for w in _topic_words(lesson_title) if w in (source_text or "").lower()]
    if source_hits and not topic_hits:
        errors.append("generated text does not reference the current lesson topic")

    return {"ok": not errors, "errors": errors}


def log_lesson_teaching_extraction_debug(
    *,
    lesson_info: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    source: str,
    validation: Optional[Dict[str, Any]] = None,
) -> None:
    combined = (validation or {}).get("combined_text") or "\n".join(
        str(c.get("text") or "") for c in chunks
    )
    headings = extract_headings_from_chunks(chunks)
    next_lesson = lesson_info.get("next_lesson") or {}
    next_title = str(next_lesson.get("title") or "")
    preview = combined[:300].replace("\n", " ")
    print("[lesson-teaching-extract] selected lessonId:", lesson_info.get("lesson_id"))
    print("[lesson-teaching-extract] selected lessonTitle:", lesson_info.get("title"))
    print("[lesson-teaching-extract] startPage:", lesson_info.get("start_page"))
    print("[lesson-teaching-extract] endPage:", lesson_info.get("end_page"))
    print("[lesson-teaching-extract] extractedTextLength:", len(combined))
    print("[lesson-teaching-extract] first300chars:", repr(preview))
    print("[lesson-teaching-extract] detectedHeadings:", headings)
    print("[lesson-teaching-extract] nextLessonTitle:", next_title or "(none)")
    print(
        "[lesson-teaching-extract] nextLessonTitleInText:",
        bool(next_title and next_title.lower() in combined.lower()),
    )
    print(
        f"[lesson-teaching-extract] source={source} chunk_count={len(chunks)} "
        f"validation_ok={(validation or {}).get('ok', True)}"
    )
    if validation and validation.get("errors"):
        print("[lesson-teaching-extract] validation_errors:", validation["errors"])


def _fetch_scoped_lesson_chunks(
    chapter_id: str,
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    max_chunks: int = 24,
    chroma_path: str = "chroma_db",
    allow_semantic_fallback: bool = False,
    query: str = "",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any], str]:
    """
    Fetch textbook chunks scoped to one lesson (title + page range).
    Returns (chunks, mapping, lesson_info, source).
    """
    from .lesson_graph import retrieve_for_item

    book_id = book_id or _book_id_from_lesson(chapter_id)
    lesson_info = resolve_lesson_for_planning(book_id, chapter_id, plan_unit)
    lesson_id = str(lesson_info["lesson_id"])
    start_page = int(lesson_info["start_page"])
    end_page = int(lesson_info["end_page"])
    next_lesson = lesson_info.get("next_lesson")

    plan_unit_resolved = dict(plan_unit or {})
    plan_unit_resolved.update(
        {
            "unit_id": lesson_info["unit_id"],
            "real_unit_id": lesson_id,
            "title": lesson_info["title"],
            "start_page": start_page,
            "end_page": end_page,
        }
    )

    mapping = ensure_lesson_mapping(
        lesson_id, book_id=book_id, plan_unit=plan_unit_resolved, chroma_path=chroma_path
    )
    mapping["title"] = lesson_info["title"]
    mapping["start_page"] = start_page
    mapping["end_page"] = end_page

    chunks: List[Dict[str, Any]] = []
    source = "lesson_pages"
    has_mapping = bool(mapping.get("chunk_ids"))

    if has_mapping:
        chunks = _fetch_chunks_by_ids(list(mapping["chunk_ids"]), chroma_path=chroma_path)
        chunks = _filter_chunks_to_page_range(chunks, start_page, end_page)
        if chunks:
            source = "stored_mapping_pages"

    if not chunks:
        _ids, unit_chunks = _chunks_for_unit_from_chroma(lesson_id, chroma_path=chroma_path)
        chunks = _filter_chunks_to_page_range(unit_chunks, start_page, end_page)
        if chunks:
            source = "unit_metadata_pages"
            if _ids:
                mapping["chunk_ids"] = _ids
                mapping["source"] = source
                save_lesson_mapping(mapping)

    if not chunks and start_page > 0 and end_page >= start_page:
        chunks = _retrieve_by_page_range(
            book_id,
            start_page,
            end_page,
            lesson_id=lesson_id,
            chroma_path=chroma_path,
            max_chunks=max_chunks,
        )
        if chunks:
            source = "page_range_only"
            mapping["chunk_ids"] = [
                str(c.get("meta", {}).get("chunk_id") or "")
                for c in chunks
                if c.get("meta", {}).get("chunk_id")
            ]
            mapping["source"] = source
            save_lesson_mapping(mapping)

    if not chunks and allow_semantic_fallback and query and not has_mapping:
        pages = {"start_page": start_page, "end_page": end_page}
        chunks = retrieve_for_item(lesson_id, query, k=max_chunks, unit_pages=pages)
        chunks = _filter_chunks_to_page_range(chunks, start_page, end_page)
        if chunks:
            source = "fallback_semantic_search"
            mapping["chunk_ids"] = [
                str(c.get("meta", {}).get("chunk_id") or "") for c in chunks
            ]
            mapping["source"] = source
            save_lesson_mapping(mapping)

    chunks = truncate_chunks_at_next_lesson(chunks, next_lesson)
    chunks = _sanitize_lesson_chunks(chunks)
    chunks = chunks[:max_chunks]
    return chunks, mapping, lesson_info, source


def retrieve_lesson_pages_for_plan(
    chapter_id: str,
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    max_chunks: int = 24,
    chroma_path: str = "chroma_db",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Retrieve textbook chunks for plan generation using ONLY this lesson's page range.
    Never falls back to whole-book semantic search.
    """
    chunks, mapping, lesson_info, source = _fetch_scoped_lesson_chunks(
        chapter_id,
        book_id=book_id,
        plan_unit=plan_unit,
        max_chunks=max_chunks,
        chroma_path=chroma_path,
        allow_semantic_fallback=False,
    )
    headings = extract_headings_from_chunks(chunks)
    log_lesson_plan_extraction_debug(
        lesson_info=lesson_info,
        chunks=chunks,
        source=source,
        extracted_headings=headings,
    )
    log_lesson_retrieval_debug(
        lesson_id=str(lesson_info["lesson_id"]), mapping=mapping, chunks=chunks, source=source
    )
    return chunks, mapping


def build_lesson_plan_context(
    *,
    title: str,
    start_page: int,
    end_page: int,
    chunks: List[Dict[str, Any]],
    subject_key: str,
    detected_sections: Optional[List[str]] = None,
) -> str:
    """User prompt body: lesson header + page-scoped excerpts only."""
    from .subject_registry import is_language_subject

    section_headings = detected_sections or extract_headings_from_chunks(chunks)
    lines = [
        f"LESSON TITLE: {title}",
        f"PAGE RANGE: {start_page}–{end_page}",
        "",
        "SCOPE RULES (mandatory):",
        f"- Plan ONLY for \"{title}\" using pages {start_page}–{end_page}.",
        "- Use ONLY the textbook excerpts below from that page range.",
        "- Do NOT include other units, future lessons, final projects, or table-of-contents entries.",
        "- Quiz and summary items must depend only on content taught in this lesson.",
        "- Never merge this lesson with the next lesson.",
    ]
    if is_language_subject(subject_key):
        if section_headings:
            lines.append(
                "- Include ONLY these sections that appear in this lesson's pages: "
                + ", ".join(section_headings)
                + "."
            )
        else:
            lines.append(
                "- This is a language lesson: include Reading, Vocabulary, Grammar, Listening, "
                "Speaking, Writing, Activities, and Exercises only when supported by these pages."
            )
    else:
        lines.append(
            "- This is NOT a language course: do NOT include listening or pronunciation items."
        )
    lines.append("")
    if chunks:
        lines.append("Lesson text (pages {}–{}):".format(start_page, end_page))
        lines.append("\n\n".join(c["text"] for c in chunks))
    else:
        lines.append(
            f"No textbook excerpt available for pages {start_page}–{end_page}. "
            "Plan conservatively from the lesson title only — do not invent content from other lessons."
        )
    return "\n".join(lines)


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
    Mapping-first textbook chunk retrieval for live teaching.

    Priority:
    1. Title-scoped lesson pages (stored mapping / unit metadata / page range)
    2. Semantic search only when no mapping exists (non-English fallback)
    """
    from .language_lesson_sections import uses_language_sections

    book_id = book_id or _book_id_from_lesson(chapter_id)
    plan_with_title = dict(plan_unit or {})
    if unit_pages:
        plan_with_title.setdefault("start_page", unit_pages.get("start_page"))
        plan_with_title.setdefault("end_page", unit_pages.get("end_page"))

    chunks, mapping, lesson_info, source = _fetch_scoped_lesson_chunks(
        chapter_id,
        book_id=book_id,
        plan_unit=plan_with_title,
        max_chunks=k,
        chroma_path=chroma_path,
        allow_semantic_fallback=True,
        query=query,
    )

    language_sections = uses_language_sections(book_id)
    pages = {
        "start_page": int(lesson_info.get("start_page") or mapping.get("start_page") or 0),
        "end_page": int(lesson_info.get("end_page") or mapping.get("end_page") or 0),
    }

    # Non-language books split pages into two halves; English uses skill sections instead.
    if unit_part is not None and pages["start_page"] > 0 and not language_sections:
        from .language_lesson_sections import part_page_range

        ps, pe = part_page_range(
            int(pages["start_page"]),
            int(pages["end_page"]),
            int(unit_part),
        )
        if ps > 0 and pe >= ps:
            chunks = _filter_chunks_to_page_range(chunks, ps, pe)
            source = f"{source}_part{unit_part}"

    if language_sections and unit_part is not None:
        from .language_lesson_sections import filter_chunks_for_section, section_type_for_index
        from .english_section_segmentation import (
            log_english_section_debug,
            validate_english_section_assignment,
        )

        teaching_section = section_type_for_index(int(unit_part))
        section_validation = validate_english_section_assignment(
            chunks,
            lesson_title=str(lesson_info.get("title") or plan_with_title.get("title") or ""),
            next_lesson=lesson_info.get("next_lesson"),
            previous_lesson=lesson_info.get("previous_lesson"),
        )
        log_english_section_debug(
            lesson_title=str(lesson_info.get("title") or ""),
            chunks=chunks,
            validation=section_validation,
        )
        if not section_validation.get("ok"):
            mapping["section_validation"] = section_validation
        filtered = filter_chunks_for_section(chunks, teaching_section)
        if filtered:
            chunks = filtered
            source = f"{source}_section_{teaching_section}"
        mapping["section_validation"] = section_validation

    validation = validate_lesson_extraction_for_teaching(
        lesson_title=str(lesson_info.get("title") or plan_with_title.get("title") or ""),
        chunks=chunks,
        next_lesson=lesson_info.get("next_lesson"),
        previous_lesson=lesson_info.get("previous_lesson"),
        min_chars=max(80, MIN_LESSON_TEACHING_CHARS // 2) if unit_part is not None else None,
    )
    log_lesson_teaching_extraction_debug(
        lesson_info=lesson_info,
        chunks=chunks,
        source=source,
        validation=validation,
    )
    log_lesson_retrieval_debug(
        lesson_id=str(lesson_info["lesson_id"]),
        mapping=mapping,
        chunks=chunks,
        source=source,
    )
    mapping["extraction_validation"] = validation
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
    lesson_info = resolve_lesson_for_planning(book_id, chapter_id, plan_unit)
    lesson_id = str(lesson_info["lesson_id"])
    plan_unit_resolved = dict(plan_unit or {})
    plan_unit_resolved.update(
        {
            "unit_id": lesson_info["unit_id"],
            "real_unit_id": lesson_id,
            "title": lesson_info["title"],
            "start_page": lesson_info["start_page"],
            "end_page": lesson_info["end_page"],
        }
    )
    mapped = session_unit_from_mapping(lesson_id, book_id=book_id, plan_unit=plan_unit_resolved)
    mapping = mapped.get("lesson_mapping") or ensure_lesson_mapping(
        lesson_id, book_id=book_id, plan_unit=plan_unit_resolved
    )
    unit_pages = {
        "start_page": int(lesson_info["start_page"]),
        "end_page": int(lesson_info["end_page"]),
    }
    unit_for_teaching = {
        **mapped,
        "unit_id": lesson_id,
        "real_unit_id": lesson_id,
        "title": lesson_info["title"],
        "unit_part": int(unit_part),
        "unit_pages": unit_pages,
        "lesson_mapping": mapping,
        "lesson_info": lesson_info,
    }
    graph_chapter_id = lesson_id if ":" in lesson_id else chapter_id
    return unit_for_teaching, graph_chapter_id
