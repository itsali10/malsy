"""Oxford Discover section detection for manifest-based English books."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from pypdf import PdfReader


def book_page_to_pdf_index(book_page: int, pdf_page_offset: int) -> int:
    return (book_page + pdf_page_offset) - 1

SECTION_DETECTORS: List[Tuple[str, str, re.Pattern]] = [
    ("word_study", "Word Study", re.compile(r"(?i)\bword study\b")),
    ("writing", "Writing Study", re.compile(r"(?i)\bwriting study\b")),
    (
        "vocab",
        "Get Ready / Vocabulary",
        re.compile(r"(?i)\bget ready\b|\bget ready words\b|\blisten and say the words\b"),
    ),
    (
        "reading",
        "Reading",
        re.compile(r"(?i)\bbefore you read\b|\bcomprehension\b|\bread the (?:short )?story\b"),
    ),
    ("grammar", "Grammar in Use", re.compile(r"(?i)\bgrammar in use\b")),
    ("listening", "Listening", re.compile(r"(?i)\blistening\b")),
    ("speaking", "Speaking", re.compile(r"(?i)\bspeaking\b")),
    (
        "exercises",
        "Exercises",
        re.compile(r"(?i)\bcircle the correct answer\b|\bwords in context\b"),
    ),
]

SECTION_LABELS = {
    "vocab": "Vocabulary",
    "listening": "Listening",
    "grammar": "Grammar",
    "reading": "Reading",
    "speaking": "Speaking",
    "writing": "Writing",
    "word_study": "Word Study",
    "exercises": "Exercises",
    "other": "Unit Content",
}

ANCHOR_SECTION_TYPES = frozenset(
    {"vocab", "listening", "word_study", "grammar", "reading", "speaking", "writing"}
)


def detect_page_section(text: str) -> Tuple[str, str]:
    for section_type, title, pattern in SECTION_DETECTORS:
        if pattern.search(text or ""):
            return section_type, title
    return "other", "Unit Content"


def build_unit_sections(
    reader: PdfReader,
    start_book: int,
    end_book: int,
    pdf_offset: int,
) -> Dict[str, Any]:
    """Walk pages in order; carry section state so reading stories are not split."""
    from .english_section_segmentation import split_text_into_section_blocks

    pages: List[Dict[str, Any]] = []
    section_pages: Dict[str, List[int]] = {}
    section_texts: Dict[str, List[str]] = {}
    active_section = "other"

    for book_page in range(start_book, end_book + 1):
        pdf_idx = book_page_to_pdf_index(book_page, pdf_offset)
        if pdf_idx < 0 or pdf_idx >= len(reader.pages):
            continue
        text = (reader.pages[pdf_idx].extract_text() or "").strip()
        if not text:
            continue

        blocks, active_section = split_text_into_section_blocks(text, active_section)
        if not blocks:
            section_type, section_title = detect_page_section(text)
            blocks = [(section_type, text)]
            active_section = section_type

        for section_type, block_text in blocks:
            if not block_text.strip():
                continue
            section_title = SECTION_LABELS.get(section_type, section_type.replace("_", " ").title())
            pages.append(
                {
                    "book_page": book_page,
                    "pdf_index": pdf_idx,
                    "section_type": section_type,
                    "section_title": section_title,
                    "text": block_text,
                }
            )
            section_pages.setdefault(section_type, []).append(book_page)
            section_texts.setdefault(section_type, []).append(block_text)

    sections_out: List[Dict[str, Any]] = []
    for section_type, book_pages in section_pages.items():
        combined = "\n\n".join(section_texts.get(section_type) or []).strip()
        sections_out.append(
            {
                "section_type": section_type,
                "section_title": SECTION_LABELS.get(section_type, section_type),
                "start_page": min(book_pages),
                "end_page": max(book_pages),
                "book_pages": sorted(set(book_pages)),
                "text_length": len(combined),
            }
        )

    sections_out.sort(key=lambda s: s["start_page"])
    return {"pages": pages, "sections": sections_out}


def section_anchor_text(section_type: str, section_title: str, combined: str) -> str:
    label = SECTION_LABELS.get(section_type, section_title)
    header = f"=== {label} Section ===\n{section_title}\n\n"
    if section_type == "vocab":
        header = "=== Vocabulary Section ===\nNew words and word study:\n\n"
    elif section_type == "listening":
        header = "=== Listening Section ===\nListening activities and comprehension questions:\n\n"
    return header + combined
