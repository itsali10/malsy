"""Detect textbook units from PDF structure and refresh manifest.json."""

from __future__ import annotations

import json
import logging
import os
import re
import statistics
from typing import Any, Dict, List, Optional, Set, Tuple

from pypdf import PdfReader

logger = logging.getLogger(__name__)

MIN_UNITS = 1
MAX_UNITS = 36
MAX_LESSONS_PER_BOOK = 120
MAX_TOC_SCAN_PAGES = 25
MAX_TOC_SPAN = 15

# ── TOC patterns ──────────────────────────────────────────────────────────────

UNIT_TOC_RE = re.compile(
    r"^Unit\s+([IVXLC]+|\d+)\s*(?:[—\-–\u2014\u2013\ufffd:]\s*|\s+-\s+)(.+?)(?:\s*\.{2,}\s*(\d+)\s*)?$",
    re.IGNORECASE,
)
LESSON_TOC_RE = re.compile(
    r"^Lesson\s+(\d+)\s*:\s*(.+?)(?:\s*\.{2,}\s*(\d+)\s*)?$",
    re.IGNORECASE,
)
LESSON_TOC_PARTIAL_RE = re.compile(r"^Lesson\s+(\d+)\s*:\s*(.*)$", re.IGNORECASE)
DOTS_PAGE_RE = re.compile(r"^\.{2,}\s*(\d+)\s*$")

# ── Body patterns ─────────────────────────────────────────────────────────────

UNIT_HEADING_RE = re.compile(
    r"^Unit\s+([IVXLC]+|\d+)\s*(?:[—\-–\u2014\u2013\ufffd:]\s*|\s+-\s+)(.+)$",
    re.IGNORECASE,
)
BODY_LESSON_RE = re.compile(
    r"^Lesson\s+(\d+)\s*:\s*(.+?)(?:\s+Grade\s+\d+|\s*$)",
    re.IGNORECASE,
)
STRONG_LESSON_HEADING_RE = re.compile(
    r"^Lesson\s+(\d+)\s*:\s*(.{3,})$",
    re.IGNORECASE,
)

IGNORE_SECTION_RE = re.compile(
    r"^(?:appendix|materials\s+list|citing\s+your\s+source|note-?taking\s+skills|"
    r"plagiarism|assignment\s+materials)\b",
    re.IGNORECASE,
)
TOC_NOISE_RE = re.compile(
    r"^(?:oak\s+meadow|grade\s+\d+|table\s+of\s+contents|basic\s+life\s+science|"
    r"[ivxlc]+|\d+\s+oak\s+meadow).*$",
    re.IGNORECASE,
)

UNIT_NUM_RE = re.compile(r"Unit\s+([IVXLC]+|\d+)", re.IGNORECASE)
ROMAN_MAP = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

PUBLISHER_PAGE_RE = re.compile(
    r"^\s*(\d{1,3})\s+(?:Oak\s+Meadow|Grade\s+\d+)",
    re.IGNORECASE,
)
PRINTED_PAGE_PATTERNS = [
    PUBLISHER_PAGE_RE,
    re.compile(r"^\s*(\d{1,3})\s*$"),
    re.compile(r"^\s*[-–—]\s*(\d{1,3})\s*[-–—]\s*$", re.IGNORECASE),
    re.compile(r"^\s*page\s+(\d{1,3})\s*$", re.IGNORECASE),
]


def normalize_manifest_unit_id(raw: str, book_id: str) -> str:
    if not raw:
        return "unit_01"
    text = str(raw).strip()
    prefix = f"{book_id}:"
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if ":" in text:
        text = text.split(":")[-1]
    return text


def full_unit_id(book_id: str, short_unit_id: str) -> str:
    short = normalize_manifest_unit_id(short_unit_id, book_id)
    return f"{book_id}:{short}"


def _roman_to_int(value: str) -> int:
    text = value.strip().upper()
    if text.isdigit():
        return int(text)
    total = 0
    prev = 0
    for ch in reversed(text):
        num = ROMAN_MAP.get(ch, 0)
        total = total - num if num < prev else total + num
        prev = num
    return total or 1


def _unit_order_key(unit: Dict[str, Any]) -> int:
    m = UNIT_NUM_RE.search(str(unit.get("title") or ""))
    if m:
        return _roman_to_int(m.group(1))
    uid = str(unit.get("unit_id") or "")
    m2 = re.search(r"unit_(\d+)", uid, re.IGNORECASE)
    if m2:
        return int(m2.group(1))
    return int(unit.get("start_page") or 99999)


def _clean_title(raw: str) -> str:
    title = re.sub(r"\s*\.{2,}.*$", "", (raw or "").strip())
    title = re.sub(r"\s+", " ", title)
    return title.strip()


def _detect_printed_page_number(text: str) -> Optional[int]:
    """Read printed textbook page from header/footer lines."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return None
    candidates = lines[:8] + lines[-8:]
    for line in candidates:
        if len(line) > 40:
            continue
        for pat in PRINTED_PAGE_PATTERNS:
            m = pat.match(line)
            if m:
                n = int(m.group(1))
                if 1 <= n <= 999:
                    return n
    return None


def _extract_pages(reader: PdfReader) -> List[Dict[str, Any]]:
    pages: List[Dict[str, Any]] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        printed = _detect_printed_page_number(text)
        pages.append(
            {
                "pdf_index": i,
                "pdf_page": i + 1,
                "page_num": i + 1,
                "printed_page": printed,
                "text": text,
            }
        )
    return pages


def _printed_numbering_reliable(pages: List[Dict[str, Any]]) -> bool:
    pairs = [
        (int(p["pdf_index"]), int(p["printed_page"]))
        for p in pages
        if p.get("printed_page") is not None
    ]
    if len(pairs) < max(6, len(pages) // 8):
        return False
    inc = sum(1 for i in range(1, len(pairs)) if pairs[i][1] >= pairs[i - 1][1])
    return inc >= len(pairs) * 0.7


def _compute_pdf_page_offset(pages: List[Dict[str, Any]]) -> int:
    """Offset for ingest: book_page = pdf_index - offset + 1."""
    offsets: List[int] = []
    for p in pages:
        printed = p.get("printed_page")
        if printed is None:
            continue
        offsets.append(int(p["pdf_index"]) - int(printed) + 1)
    if not offsets:
        return 0
    return int(round(statistics.median(offsets)))


def _pdf_is_contiguous(pages: List[Dict[str, Any]]) -> bool:
    """True when printed pages increase by ~1 per PDF page (full book scan)."""
    pairs = [
        (int(p["pdf_index"]), int(p["printed_page"]))
        for p in pages
        if p.get("printed_page") is not None
    ]
    if len(pairs) < 10:
        return True
    jumps = [pairs[i][1] - pairs[i - 1][1] for i in range(1, len(pairs))]
    big = sum(1 for j in jumps if j > 3)
    return big <= len(jumps) * 0.15


def _apply_page_numbering(pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Choose ONE numbering system and set norm_page on every page."""
    use_printed = _printed_numbering_reliable(pages)
    numbering = "printed" if use_printed else "pdf_index"
    offset = _compute_pdf_page_offset(pages) if use_printed else 0
    contiguous = _pdf_is_contiguous(pages) if use_printed else True

    for p in pages:
        pdf_idx = int(p["pdf_index"])
        pdf_page = int(p["pdf_page"])
        printed = p.get("printed_page")
        if use_printed and printed is not None:
            norm = int(printed)
        elif use_printed:
            norm = pdf_idx - offset + 1
        else:
            norm = pdf_page
        p["norm_page"] = norm
        logger.debug(
            "[structure] pdf_index=%s pdf_page=%s printed=%s norm_page=%s",
            pdf_idx,
            pdf_page,
            printed,
            norm,
        )

    max_norm = max(int(p["norm_page"]) for p in pages) if pages else 0
    page_map = {
        "numbering": numbering,
        "pdf_page_offset": offset if contiguous else 0,
        "non_contiguous_pdf": not contiguous,
        "max_page": max_norm,
        "page_count": len(pages),
    }
    logger.info(
        "[structure] page numbering=%s offset=%s contiguous=%s max_norm=%s",
        numbering,
        offset,
        contiguous,
        max_norm,
    )
    return page_map


def _norm(p: Dict[str, Any]) -> int:
    return int(p.get("norm_page") or p.get("page_num") or 1)


def _is_toc_page(page: Dict[str, Any]) -> bool:
    """TOC pages list lessons with dot leaders — not real lesson body starts."""
    text = page.get("text") or ""
    if not re.search(r"table\s+of\s+contents", text, re.IGNORECASE):
        return False
    first_lines = [ln.strip() for ln in text.splitlines()[:6] if ln.strip()]
    for line in first_lines:
        if BODY_LESSON_RE.match(line) and re.search(r"Grade\s+\d+", line, re.IGNORECASE):
            return False
    if re.search(r"\.{4,}", text) and (
        LESSON_TOC_RE.search(text) or UNIT_TOC_RE.search(text) or LESSON_TOC_PARTIAL_RE.search(text)
    ):
        return True
    return bool(re.search(r"table\s+of\s+contents", text[:300], re.IGNORECASE))


def _find_toc_page_nums(pages: List[Dict[str, Any]]) -> List[int]:
    start: Optional[int] = None
    for p in pages[:MAX_TOC_SCAN_PAGES]:
        if re.search(r"table\s+of\s+contents", p["text"], re.IGNORECASE):
            start = p["page_num"]
            break
    if start is None:
        return []

    nums: List[int] = []
    for p in pages:
        pn = p["page_num"]
        if pn < start or pn > start + MAX_TOC_SPAN:
            continue
        if _is_toc_page(p) or (pn == start):
            nums.append(pn)
        elif pn > start and re.search(r"table\s+of\s+contents", p["text"][:400], re.IGNORECASE):
            nums.append(pn)
        elif pn > start:
            break
    return nums


def _merge_toc_lines(pages: List[Dict[str, Any]], toc_page_nums: List[int]) -> List[str]:
    raw: List[str] = []
    for p in pages:
        if p["page_num"] not in toc_page_nums:
            continue
        for line in p["text"].splitlines():
            stripped = line.strip()
            if stripped:
                raw.append(stripped)

    merged: List[str] = []
    i = 0
    while i < len(raw):
        line = raw[i]
        if _is_toc_noise(line):
            i += 1
            continue
        page_suffix: Optional[str] = None
        if i + 1 < len(raw):
            nxt = raw[i + 1]
            if DOTS_PAGE_RE.match(nxt):
                page_suffix = nxt
                i += 2
                if DOTS_PAGE_RE.match(line):
                    merged.append(line)
                    continue
                merged.append(f"{line}  {nxt.strip()}")
                continue
            if re.match(r"^\d+$", nxt) and LESSON_TOC_PARTIAL_RE.match(line):
                page_suffix = nxt
                i += 2
                merged.append(f"{line}  ... {nxt}")
                continue
        merged.append(line)
        i += 1
    return merged


def _is_toc_noise(line: str) -> bool:
    text = line.strip()
    if not text or len(text) < 2:
        return True
    if UNIT_TOC_RE.match(text) or LESSON_TOC_RE.match(text) or LESSON_TOC_PARTIAL_RE.match(text):
        return False
    if TOC_NOISE_RE.match(text):
        return True
    if re.match(r"^[\.\s\d]+$", text):
        return True
    if "table of contents" in text.lower():
        return True
    return False


def _parse_toc_structure(pages: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int, Optional[int]]:
    """
    Parse TOC for unit/lesson titles and printed start pages.
    Returns (units, max_toc_page, appendix_start_page).
    """
    toc_pages = _find_toc_page_nums(pages)
    if not toc_pages:
        return [], 0, None

    lines = _merge_toc_lines(pages, toc_pages)
    units: List[Dict[str, Any]] = []
    current_unit: Optional[Dict[str, Any]] = None
    seen_in_unit: Set[int] = set()
    max_toc_page = 0
    appendix_start: Optional[int] = None
    pending_lesson: Optional[Dict[str, Any]] = None

    for line in lines:
        if re.match(r"^materials\s+list\b", line, re.IGNORECASE):
            m = re.search(r"(\d+)\s*$", line)
            if m:
                appendix_start = int(m.group(1))
                max_toc_page = max(max_toc_page, appendix_start)
            break
        if re.match(r"^appendix\s*$", line, re.IGNORECASE):
            continue
        if IGNORE_SECTION_RE.match(line):
            break
        um = UNIT_TOC_RE.match(line)
        if um:
            unit_num_raw, title_raw, page_raw = um.groups()
            title = _clean_title(title_raw)
            if not title:
                continue
            unit_order = _roman_to_int(unit_num_raw)
            seen_in_unit = set()
            pending_lesson = None
            current_unit = {
                "unit_id": f"unit_{unit_order:02d}",
                "unit_num": unit_order,
                "title": f"Unit {unit_num_raw} — {title}",
                "lessons": [],
            }
            if page_raw:
                current_unit["toc_start_page"] = int(page_raw)
                max_toc_page = max(max_toc_page, int(page_raw))
            units.append(current_unit)
            continue

        lm = LESSON_TOC_RE.match(line)
        if lm:
            lesson_num = int(lm.group(1))
            if lesson_num in seen_in_unit:
                continue
            title = _clean_title(lm.group(2))
            page_raw = lm.group(3)
            if not title or len(title) < 2:
                pending_lesson = {"lesson_num": lesson_num, "title": title or f"Lesson {lesson_num}"}
                continue
            seen_in_unit.add(lesson_num)
            toc_page = int(page_raw) if page_raw else None
            if toc_page:
                max_toc_page = max(max_toc_page, toc_page)
            if current_unit is None:
                current_unit = {"unit_id": "unit_01", "unit_num": 1, "title": "Unit 1", "lessons": []}
                units.append(current_unit)
            current_unit["lessons"].append(
                {
                    "lesson_id": f"lesson_{lesson_num:02d}",
                    "lesson_num": lesson_num,
                    "title": title,
                    "toc_start_page": toc_page,
                }
            )
            pending_lesson = None
            continue

        if DOTS_PAGE_RE.match(line) and pending_lesson and current_unit:
            toc_page = int(DOTS_PAGE_RE.match(line).group(1))
            max_toc_page = max(max_toc_page, toc_page)
            num = pending_lesson["lesson_num"]
            if num not in seen_in_unit:
                seen_in_unit.add(num)
                current_unit["lessons"].append(
                    {
                        "lesson_id": f"lesson_{num:02d}",
                        "lesson_num": num,
                        "title": pending_lesson["title"],
                        "toc_start_page": toc_page,
                    }
                )
            pending_lesson = None

    return units, max_toc_page, appendix_start


def _scan_body_lesson_starts(pages: List[Dict[str, Any]]) -> Dict[int, int]:
    """Map lesson_num -> printed norm_page from real lesson body pages only."""
    starts: Dict[int, int] = {}
    for page in pages:
        if _is_toc_page(page):
            continue
        if re.search(r"\bappendix\b", (page.get("text") or "")[:250], re.IGNORECASE):
            break

        text = page.get("text") or ""
        norm = _norm(page)

        for line in text.splitlines()[:8]:
            line = line.strip()
            m = BODY_LESSON_RE.match(line)
            if not m:
                continue
            if not re.search(r"Grade\s+\d+", line, re.IGNORECASE):
                continue
            num = int(m.group(1))
            title = _clean_title(m.group(2))
            if len(title) < 3:
                continue
            if num not in starts or norm < starts[num]:
                starts[num] = norm
                logger.info(
                    "[structure] body lesson %s %r norm_page=%s pdf_page=%s",
                    num,
                    title[:50],
                    norm,
                    page.get("pdf_page"),
                )
    return starts


def _scan_body_unit_starts(pages: List[Dict[str, Any]]) -> Dict[int, int]:
    """Map unit_num -> norm_page from non-TOC body pages."""
    starts: Dict[int, int] = {}
    for page in pages:
        if _is_toc_page(page):
            continue
        for line in (page.get("text") or "").splitlines()[:20]:
            line = line.strip()
            if IGNORE_SECTION_RE.match(line):
                continue
            um = UNIT_HEADING_RE.match(line)
            if um and re.search(r"Grade\s+\d+", page.get("text") or "", re.IGNORECASE):
                num = _roman_to_int(um.group(1))
                norm = _norm(page)
                if num not in starts:
                    starts[num] = norm
                    logger.info("[structure] body unit %s norm_page=%s", num, norm)
    return starts


def _resolve_lesson_start(
    lesson_num: int,
    toc_start: Optional[int],
    body_starts: Dict[int, int],
) -> Optional[int]:
    """Prefer earliest reliable start between TOC and body detection."""
    body = body_starts.get(lesson_num)
    if body is not None and toc_start is not None:
        return min(int(body), int(toc_start))
    return body if body is not None else toc_start


def _build_structure(
    toc_units: List[Dict[str, Any]],
    body_lesson_starts: Dict[int, int],
    max_book_page: int,
) -> List[Dict[str, Any]]:
    """
    Build units/lessons using TOC for grouping/titles and body/TOC for start pages.
    End pages and unit ranges are derived from lesson boundaries only.
    """
    flat: List[Dict[str, Any]] = []
    for u in sorted(toc_units, key=_unit_order_key):
        for les in u.get("lessons") or []:
            num = int(les["lesson_num"])
            start = _resolve_lesson_start(num, les.get("toc_start_page"), body_lesson_starts)
            if start is None:
                logger.warning("[structure] lesson %s missing start page — skipped", num)
                continue
            flat.append(
                {
                    "lesson_id": les["lesson_id"],
                    "lesson_num": num,
                    "title": les["title"],
                    "start_page": int(start),
                    "unit_ref": u,
                }
            )

    if not flat:
        return []

    flat.sort(key=lambda l: int(l["start_page"]))

    for i, les in enumerate(flat):
        if i + 1 < len(flat):
            les["end_page"] = max(int(les["start_page"]), int(flat[i + 1]["start_page"]) - 1)
        else:
            les["end_page"] = max(int(les["start_page"]), max_book_page)

    units_out: List[Dict[str, Any]] = []
    for u in sorted(toc_units, key=_unit_order_key):
        unit_lessons = [l for l in flat if l["unit_ref"] is u]
        if not unit_lessons:
            continue
        unit_lessons.sort(key=lambda l: int(l["lesson_num"]))
        lessons_clean = [
            {
                "lesson_id": l["lesson_id"],
                "lesson_num": l["lesson_num"],
                "title": l["title"],
                "start_page": l["start_page"],
                "end_page": l["end_page"],
            }
            for l in unit_lessons
        ]
        u_out = {
            "unit_id": u["unit_id"],
            "unit_num": u.get("unit_num"),
            "title": u["title"],
            "start_page": min(int(l["start_page"]) for l in lessons_clean),
            "end_page": max(int(l["end_page"]) for l in lessons_clean),
            "lessons": lessons_clean,
        }
        units_out.append(u_out)
        logger.info(
            "[structure] FINAL unit=%r pages=%s-%s lessons=%s",
            u_out["title"],
            u_out["start_page"],
            u_out["end_page"],
            [(l["title"][:30], l["start_page"], l["end_page"]) for l in lessons_clean],
        )

    return units_out[:MAX_UNITS]


def _estimate_max_book_page(
    toc_units: List[Dict[str, Any]],
    toc_max: int,
    pages: List[Dict[str, Any]],
    appendix_start: Optional[int],
) -> int:
    """Last content page before appendix/back matter."""
    if appendix_start and appendix_start > 1:
        return appendix_start - 1
    candidates = [toc_max]
    for u in toc_units:
        for les in u.get("lessons") or []:
            if les.get("toc_start_page"):
                candidates.append(int(les["toc_start_page"]) + 14)
    return max(candidates) if candidates else max(_norm(p) for p in pages)


def _validate_structure(units: List[Dict[str, Any]], max_norm: int) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    if not units:
        errors.append("No units/lessons detected")
        return False, errors

    prev_lesson_end = 0
    for u in sorted(units, key=_unit_order_key):
        title = u.get("title") or u.get("unit_id")
        us = int(u.get("start_page") or 0)
        ue = int(u.get("end_page") or 0)
        lessons = sorted(u.get("lessons") or [], key=lambda l: int(l.get("start_page") or 0))

        if us <= 0 or ue <= 0 or us > ue:
            errors.append(f"Unit {title!r}: invalid range {us}-{ue}")
        if not lessons:
            errors.append(f"Unit {title!r}: has no lessons")

        if lessons:
            ls_min = min(int(l["start_page"]) for l in lessons)
            le_max = max(int(l["end_page"]) for l in lessons)
            if ls_min != us or le_max != ue:
                errors.append(
                    f"Unit {title!r}: unit range {us}-{ue} does not match lessons {ls_min}-{le_max}"
                )

        prev_in_unit_end = 0
        for les in lessons:
            ls = int(les.get("start_page") or 0)
            le = int(les.get("end_page") or 0)
            lt = les.get("title") or les.get("lesson_id")
            if ls <= 0 or le <= 0 or ls > le:
                errors.append(f"Lesson {lt!r} in {title!r}: invalid range {ls}-{le}")
            if ls < us or le > ue:
                errors.append(f"Lesson {lt!r}: pages {ls}-{le} outside unit {us}-{ue}")
            if prev_in_unit_end and ls != prev_in_unit_end + 1:
                errors.append(
                    f"Lesson {lt!r}: expected start {prev_in_unit_end + 1}, got {ls}"
                )
            if prev_lesson_end and ls <= prev_lesson_end:
                errors.append(
                    f"Lesson {lt!r}: overlaps previous lesson (starts {ls}, prev ended {prev_lesson_end})"
                )
            prev_in_unit_end = le
            prev_lesson_end = le

    if errors:
        for err in errors:
            logger.error("[structure] validation: %s", err)
    return len(errors) == 0, errors


def _normalize_unit_list(units: List[Dict[str, Any]], book_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for i, u in enumerate(units[:MAX_UNITS]):
        short = normalize_manifest_unit_id(u.get("unit_id", ""), book_id)
        if not short.startswith("unit_"):
            short = f"unit_{i + 1:02d}"
        entry: Dict[str, Any] = {
            "unit_id": short,
            "title": (u.get("title") or f"Unit {i + 1}").strip(),
            "start_page": max(1, int(u.get("start_page") or 1)),
            "end_page": int(u.get("end_page") or u.get("start_page") or 1),
        }
        lessons = u.get("lessons")
        if lessons:
            entry["lessons"] = []
            for les in lessons:
                les_entry: Dict[str, Any] = {
                    "lesson_id": les.get("lesson_id") or f"lesson_{len(entry['lessons']) + 1:02d}",
                    "title": _clean_title(les.get("title") or "Lesson"),
                    "start_page": max(1, int(les.get("start_page") or entry["start_page"])),
                    "end_page": int(les.get("end_page") or les.get("start_page") or entry["start_page"]),
                }
                if les.get("lesson_num") is not None:
                    les_entry["lesson_num"] = int(les["lesson_num"])
                entry["lessons"].append(les_entry)
        out.append(entry)
    out.sort(key=lambda u: _unit_order_key(u))
    return out


def detect_book_structure(pdf_path: str, *, book_title: str = "") -> Dict[str, Any]:
    """Extract units/lessons/page ranges using one consistent page numbering system."""
    reader = PdfReader(pdf_path)
    pages = _extract_pages(reader)
    total = len(pages)
    if total == 0:
        return {
            "units": [],
            "detection_method": "empty",
            "warning": "PDF has no readable pages.",
            "page_count": 0,
            "needs_review": True,
            "validation_errors": ["PDF has no readable pages"],
            "page_map": {},
        }

    page_map = _apply_page_numbering(pages)
    max_norm = int(page_map.get("max_page") or total)

    toc_units, toc_max, appendix_start = _parse_toc_structure(pages)
    body_starts = _scan_body_lesson_starts(pages)
    max_book_page = _estimate_max_book_page(toc_units, toc_max, pages, appendix_start)

    if toc_units and sum(len(u.get("lessons") or []) for u in toc_units) >= 2:
        units = _build_structure(toc_units, body_starts, max_book_page)
        method = "toc_plus_body"
        warning: Optional[str] = None
        if page_map.get("non_contiguous_pdf"):
            warning = "PDF appears to be a non-contiguous sample; page offset may not map all lessons."
    elif body_starts:
        warning = "Body lessons found without TOC grouping — structure needs review."
        units = []
        method = "body_only_partial"
    else:
        units = []
        method = "failed"
        warning = "Could not detect unit/lesson structure in the PDF."

    valid, validation_errors = _validate_structure(units, max_norm)
    needs_review = not valid

    if not valid:
        logger.error("[structure] validation failed — not saving ranges: %s", validation_errors)
        units = []

    if needs_review and not warning:
        warning = "Book structure failed validation and needs admin review."

    return {
        "units": units,
        "detection_method": method,
        "warning": warning,
        "page_count": total,
        "page_map": page_map,
        "needs_review": needs_review,
        "validation_errors": validation_errors,
    }


def detect_units_from_pdf(pdf_path: str, *, book_title: str = "") -> List[Dict[str, Any]]:
    detected = detect_book_structure(pdf_path, book_title=book_title)
    return detected["units"]


def prepare_manifest_units_for_ingest(units: List[Dict[str, Any]], book_id: str) -> List[Dict[str, Any]]:
    flat: List[Dict[str, Any]] = []
    for u in units:
        lessons = u.get("lessons") or []
        if len(lessons) >= 2:
            for les in lessons:
                short = normalize_manifest_unit_id(
                    f"{u['unit_id']}_{les.get('lesson_id', 'lesson_01')}", book_id
                )
                flat.append(
                    {
                        "unit_id": short,
                        "title": les.get("title") or u.get("title") or "Lesson",
                        "start_page": int(les.get("start_page") or u.get("start_page") or 1),
                        "end_page": les.get("end_page"),
                    }
                )
        elif len(lessons) == 1:
            les = lessons[0]
            flat.append(
                {
                    "unit_id": normalize_manifest_unit_id(u.get("unit_id", ""), book_id),
                    "title": les.get("title") or u.get("title") or "Lesson",
                    "start_page": int(les.get("start_page") or u.get("start_page") or 1),
                    "end_page": les.get("end_page"),
                }
            )
        else:
            flat.append(
                {
                    "unit_id": normalize_manifest_unit_id(u.get("unit_id", ""), book_id),
                    "title": u.get("title") or "Unit",
                    "start_page": int(u.get("start_page") or 1),
                    "end_page": u.get("end_page"),
                }
            )
    return _normalize_unit_list(flat, book_id)


def run_structure_extraction(book_id: str, *, force: bool = False) -> Dict[str, Any]:
    """Extract PDF structure into manifest for admin review (no RAG ingest)."""
    from datetime import datetime, timezone

    from .book_registry import book_dir, upsert_book_record
    from .ingest_books import load_manifest, pdf_path

    upsert_book_record(book_id, structure_status="extracting", error_message=None)
    book_dir_path = book_dir(book_id)
    manifest_path = os.path.join(book_dir_path, "manifest.json")
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(manifest_path)

    manifest = load_manifest(book_dir_path)
    pdf = pdf_path(book_dir_path, manifest)
    if not os.path.isfile(pdf):
        raise FileNotFoundError(pdf)

    detected = detect_book_structure(pdf, book_title=manifest.get("title") or book_id)
    validation_errors = detected.get("validation_errors") or []
    needs_review = bool(detected.get("needs_review"))

    if needs_review:
        normalized: List[Dict[str, Any]] = []
        structure_status = "needs_review"
    else:
        normalized = _normalize_unit_list(detected["units"], book_id)
        structure_status = "draft"

    nested_lessons = sum(len(u.get("lessons") or []) for u in normalized)
    lesson_count = nested_lessons if nested_lessons > 0 else len(normalized)

    manifest["units"] = normalized
    manifest["page_map"] = detected.get("page_map") or {}
    manifest["structure"] = {
        "detection_method": detected["detection_method"],
        "warning": detected.get("warning"),
        "page_count": detected["page_count"],
        "needs_review": needs_review,
        "validation_errors": validation_errors,
        "page_map": detected.get("page_map") or {},
        "extracted_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    upsert_book_record(
        book_id,
        structure_status=structure_status,
        structure_warning=detected.get("warning"),
        structure_detection_method=detected["detection_method"],
        structure_extracted_at=manifest["structure"]["extracted_at"],
        unit_count=len(normalized),
        lesson_count=lesson_count,
        status="uploaded",
        error_message="; ".join(validation_errors) if validation_errors else None,
    )
    return manifest


def approve_and_prepare_manifest(book_id: str, manifest: Dict[str, Any]) -> Dict[str, Any]:
    from datetime import datetime, timezone

    from .book_registry import book_dir, upsert_book_record

    if (manifest.get("structure") or {}).get("needs_review"):
        raise ValueError("Book structure failed validation — fix or re-extract before approving.")

    units = manifest.get("units") or []
    ingest_units = prepare_manifest_units_for_ingest(units, book_id)
    manifest["units"] = ingest_units
    manifest["structure"] = {
        **(manifest.get("structure") or {}),
        "approved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "admin_edited": True,
    }
    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    upsert_book_record(
        book_id,
        structure_status="approved",
        structure_approved_at=manifest["structure"]["approved_at"],
        unit_count=len({normalize_manifest_unit_id(u["unit_id"], book_id).split("_lesson_")[0] for u in ingest_units}),
        lesson_count=len(ingest_units),
    )
    return manifest


def _manifest_needs_unit_refresh(manifest: Dict[str, Any], book_id: str) -> bool:
    units = manifest.get("units") or []
    if len(units) <= 1:
        return True
    for u in units:
        raw = str(u.get("unit_id") or "")
        if book_id in raw or ":" in raw:
            return True
    return False


def refresh_manifest_units_from_pdf(book_id: str, *, force: bool = False) -> Dict[str, Any]:
    from .book_registry import book_dir
    from .ingest_books import load_manifest, pdf_path

    book_dir_path = book_dir(book_id)
    manifest_path = os.path.join(book_dir_path, "manifest.json")
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(manifest_path)

    manifest = load_manifest(book_dir_path)
    existing = manifest.get("units") or []

    normalized_existing = _normalize_unit_list(existing, book_id)
    manifest["units"] = normalized_existing

    pdf = pdf_path(book_dir_path, manifest)
    should_detect = force or _manifest_needs_unit_refresh(manifest, book_id)
    if should_detect and os.path.isfile(pdf):
        rec = None
        try:
            from .book_registry import get_book_record

            rec = get_book_record(book_id)
        except Exception:
            pass
        if rec and rec.get("structure_status") == "approved" and not force:
            should_detect = False
    if should_detect and os.path.isfile(pdf):
        detected = detect_book_structure(pdf, book_title=manifest.get("title") or book_id)
        if not detected.get("needs_review"):
            manifest["units"] = _normalize_unit_list(detected["units"], book_id)
            manifest["page_map"] = detected.get("page_map") or {}

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return manifest
