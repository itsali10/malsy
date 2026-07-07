"""Sequential English textbook section segmentation (Reading, Grammar, Vocabulary, …)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from .book_sections import SECTION_LABELS, detect_page_section

# Line-start patterns that begin a new textbook section (Oxford Discover style).
SECTION_TRANSITION_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("vocab", re.compile(r"(?i)^(get ready\b|get ready words|listen and say the words)\b")),
    ("vocab", re.compile(r"(?i)^(?:unit\s+\d+\s+)?vocabulary\b")),
    ("reading", re.compile(r"(?i)^(before you read|read the (?:short )?story|after you read)\b")),
    ("grammar", re.compile(r"(?i)^grammar in use\b")),
    ("listening", re.compile(r"(?i)^listening\s*$")),
    ("speaking", re.compile(r"(?i)^speaking\s*$")),
    ("writing", re.compile(r"(?i)^writing study\b")),
    ("writing", re.compile(r"(?i)^write (?:two short paragraphs|now)\b")),
    ("word_study", re.compile(r"(?i)^word study\b")),
    (
        "exercises",
        re.compile(r"(?i)^(circle the correct answer|words in context|complete the (?:sentences|chart))\b"),
    ),
    ("reading", re.compile(r"(?i)^comprehension\b")),
]

# Maps each live-teaching section (Reading / Grammar / Listening / Pronunciation) to
# stored section_type buckets. UI still exposes four sections — no UI change.
TEACHING_SECTION_INCLUDES: Dict[str, frozenset[str]] = {
    "reading": frozenset({"vocab", "reading"}),
    "grammar": frozenset({"grammar"}),
    "listening": frozenset({"listening"}),
    "speaking": frozenset({"speaking", "word_study"}),
    "writing": frozenset({"writing"}),
}

_MIN_PARA_CHARS = 48
_PARA_SPLIT_RE = re.compile(r"\n\s*\n+")


def _chunk_book_page(chunk: Dict[str, Any]) -> int:
    meta = chunk.get("meta") or {}
    page = meta.get("book_page") or meta.get("pdf_page")
    try:
        return int(page or 0)
    except (TypeError, ValueError):
        return 0


def detect_line_section(line: str) -> Optional[str]:
    stripped = (line or "").strip()
    if not stripped or len(stripped) < 3:
        return None
    for section_type, pattern in SECTION_TRANSITION_PATTERNS:
        if pattern.search(stripped):
            return section_type
    return None


def split_text_into_section_blocks(
    text: str,
    active_section: str,
) -> Tuple[List[Tuple[str, str]], str]:
    """Split one text block at section headings; carry active section across lines."""
    if not (text or "").strip():
        return [], active_section

    blocks: List[Tuple[str, str]] = []
    current = active_section or "other"
    buffer: List[str] = []

    def flush() -> None:
        nonlocal buffer, current
        joined = "\n".join(buffer).strip()
        buffer = []
        if joined:
            blocks.append((current, joined))

    for line in str(text).splitlines():
        found = detect_line_section(line)
        if found and found != current:
            flush()
            current = found
        buffer.append(line)
    flush()

    if not blocks:
        inferred, _ = detect_page_section(text)
        sec = inferred if inferred != "other" else (active_section or "other")
        return [(sec, text.strip())], sec

    # Continuation pages with no new heading inherit the active section.
    finalized: List[Tuple[str, str]] = []
    carry = active_section or "other"
    for sec, body in blocks:
        use = sec if sec != "other" else carry
        if use == "other":
            inferred, _ = detect_page_section(body)
            use = inferred if inferred != "other" else carry
        carry = use
        finalized.append((use, body))
    return finalized, carry


def segment_chunks_into_sections(chunks: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Assign every chunk to exactly one textbook section using sequential heading detection."""
    ordered = sorted(
        chunks,
        key=lambda c: (_chunk_book_page(c), str((c.get("meta") or {}).get("chunk_id") or "")),
    )
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    active = "other"

    for chunk in ordered:
        meta = dict(chunk.get("meta") or {})
        existing = str(meta.get("section_type") or "").lower().strip()
        text = str(chunk.get("text") or "")

        if existing and existing not in {"", "other", "?"}:
            blocks = [(existing, text)]
            active = existing
        else:
            blocks, active = split_text_into_section_blocks(text, active)

        for section_type, body in blocks:
            body = body.strip()
            if len(body) < 15:
                continue
            sec = section_type if section_type != "other" else active
            out_meta = {
                **meta,
                "section_type": sec,
                "section_title": SECTION_LABELS.get(sec, sec.replace("_", " ").title()),
            }
            out = {**chunk, "text": body, "meta": out_meta}
            buckets.setdefault(sec, []).append(out)

    return buckets


def assign_sections_to_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a flat, page-ordered chunk list with section_type metadata filled in."""
    segmented = segment_chunks_into_sections(chunks)
    flat: List[Dict[str, Any]] = []
    for sec_chunks in segmented.values():
        flat.extend(sec_chunks)
    flat.sort(key=lambda c: (_chunk_book_page(c), str((c.get("meta") or {}).get("chunk_id") or "")))
    return flat


def chunks_for_teaching_section(
    chunks: List[Dict[str, Any]],
    teaching_section_type: str,
) -> List[Dict[str, Any]]:
    """Keep only chunks that belong to one live-teaching section (reading, grammar, …)."""
    if not chunks or not teaching_section_type:
        return []
    segmented = segment_chunks_into_sections(chunks)
    teaching = teaching_section_type.lower()
    includes = TEACHING_SECTION_INCLUDES.get(
        teaching,
        frozenset({teaching}),
    )
    grammar_start = 99999
    grammar_chunks = segmented.get("grammar") or []
    if grammar_chunks:
        grammar_start = min(_chunk_book_page(c) or 99999 for c in grammar_chunks)

    matched: List[Dict[str, Any]] = []
    for section_type, sec_chunks in segmented.items():
        if section_type not in includes:
            continue
        for chunk in sec_chunks:
            page = _chunk_book_page(chunk)
            if teaching == "reading" and section_type == "vocab" and page >= grammar_start:
                continue
            if teaching == "reading" and section_type == "reading" and page > grammar_start:
                continue
            matched.append(chunk)
    matched.sort(key=lambda c: (_chunk_book_page(c), str((c.get("meta") or {}).get("chunk_id") or "")))
    return matched


def _paragraph_fingerprints(text: str) -> List[str]:
    out: List[str] = []
    for para in _PARA_SPLIT_RE.split(str(text or "").strip()):
        norm = re.sub(r"\s+", " ", para.lower()).strip()
        if len(norm) >= _MIN_PARA_CHARS:
            out.append(norm)
    return out


def validate_english_section_assignment(
    chunks: List[Dict[str, Any]],
    *,
    lesson_title: str = "",
    next_lesson: Optional[Dict[str, Any]] = None,
    previous_lesson: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Validate section boundaries before saving or teaching an English lesson."""
    segmented = segment_chunks_into_sections(chunks)
    errors: List[str] = []

    owner: Dict[str, str] = {}
    duplicate_count = 0
    overlap_count = 0

    for section_type, sec_chunks in segmented.items():
        for chunk in sec_chunks:
            for fp in _paragraph_fingerprints(str(chunk.get("text") or "")):
                if fp in owner:
                    if owner[fp] != section_type:
                        overlap_count += 1
                    else:
                        duplicate_count += 1
                else:
                    owner[fp] = section_type

    if overlap_count > 0:
        errors.append(f"cross-section paragraph overlap: {overlap_count}")

    combined = "\n".join(str(c.get("text") or "") for clist in segmented.values() for c in clist)
    combined_lower = combined.lower()

    next_title = str((next_lesson or {}).get("title") or "").strip()
    if next_title and next_title.lower() in combined_lower:
        errors.append(f"next lesson title in text: {next_title!r}")

    prev_title = str((previous_lesson or {}).get("title") or "").strip()
    if prev_title and prev_title.lower() in combined_lower:
        if prev_title.lower() not in (lesson_title or "").lower():
            errors.append(f"previous lesson title in text: {prev_title!r}")

    reading_chunks = segmented.get("reading") or []
    grammar_chunks = segmented.get("grammar") or []
    vocab_chunks = segmented.get("vocab") or []

    reading_paras = sum(len(_paragraph_fingerprints(c.get("text", ""))) for c in reading_chunks)
    grammar_paras = sum(len(_paragraph_fingerprints(c.get("text", ""))) for c in grammar_chunks)
    vocab_paras = sum(len(_paragraph_fingerprints(c.get("text", ""))) for c in vocab_chunks)

    # Grammar must not contain long narrative blocks typical of reading stories.
    story_markers = (" said ", " asked ", " replied ", " thought ")
    for chunk in grammar_chunks:
        lower = str(chunk.get("text") or "").lower()
        if any(m in lower for m in story_markers) and len(lower) > 400:
            errors.append("grammar section contains reading-story paragraphs")
            break

    return {
        "ok": not errors,
        "errors": errors,
        "sections": segmented,
        "reading_paragraphs": reading_paras,
        "grammar_paragraphs": grammar_paras,
        "vocabulary_paragraphs": vocab_paras,
        "duplicate_paragraphs": duplicate_count,
        "cross_section_overlap": overlap_count,
    }


def log_english_section_debug(
    *,
    lesson_title: str,
    chunks: List[Dict[str, Any]],
    validation: Optional[Dict[str, Any]] = None,
) -> None:
    val = validation or validate_english_section_assignment(chunks, lesson_title=lesson_title)
    segmented = val.get("sections") or segment_chunks_into_sections(chunks)

    def _preview(section_type: str) -> str:
        text = "\n".join(str(c.get("text") or "") for c in segmented.get(section_type) or [])
        return text[:160].replace("\n", " ")

    print("[english-section] Selected Lesson:", lesson_title)
    print("[english-section] Detected Reading section:", bool(segmented.get("reading")))
    print("[english-section] Detected Grammar section:", bool(segmented.get("grammar")))
    print("[english-section] Detected Vocabulary section:", bool(segmented.get("vocab")))
    print("[english-section] Reading paragraphs:", val.get("reading_paragraphs", 0))
    print("[english-section] Grammar paragraphs:", val.get("grammar_paragraphs", 0))
    print("[english-section] Duplicate paragraphs:", val.get("duplicate_paragraphs", 0))
    print("[english-section] Cross-section overlap:", val.get("cross_section_overlap", 0))
    if segmented.get("reading"):
        print("[english-section] Reading preview:", repr(_preview("reading")))
    if segmented.get("grammar"):
        print("[english-section] Grammar preview:", repr(_preview("grammar")))
    if val.get("errors"):
        print("[english-section] validation_errors:", val["errors"])
