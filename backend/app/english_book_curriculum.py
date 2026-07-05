"""English book module structure for admin (Grammar, Vocabulary, Pronunciation, Listening).

Mirrors the Oxford Discover english_g6 book skills plus portal Grammar/Pronunciation tracks
that students use from learning-config.ts — without changing the student portal.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from .portal_curriculum import PORTAL_CURRICULUM, chapter_id_for_lesson
from .storage import DATA_DIR, load_json

BOOK_ID = "english_g6"
BOOKS_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "books")
PLAN_PATH = os.path.join(DATA_DIR, "plan_english_g6.json")
SECTIONS_PATH = os.path.join(BOOKS_ROOT, BOOK_ID, "sections.json")

# Admin English modules — only the English book uses this 4-module layout.
ENGLISH_MODULE_DEFS: List[Dict[str, Any]] = [
    {
        "module_key": "english_grammar",
        "module_title": "Grammar",
        "icon": "✏️",
        "source": "portal",
        "portal_section_key": "english_grammar",
    },
    {
        "module_key": "english_vocabulary",
        "module_title": "Vocabulary",
        "icon": "📚",
        "source": "book",
        "section_type": "vocab",
    },
    {
        "module_key": "english_speaking",
        "module_title": "Pronunciation",
        "icon": "🎤",
        "source": "portal",
        "portal_section_key": "english_speaking",
    },
    {
        "module_key": "english_listening",
        "module_title": "Listening",
        "icon": "🎧",
        "source": "book",
        "section_type": "listening",
    },
]


def _load_book_plan() -> Dict[str, Any]:
    if os.path.isfile(PLAN_PATH):
        with open(PLAN_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"units": []}


def _portal_section_lessons(section_key: str) -> List[Dict[str, Any]]:
    english = PORTAL_CURRICULUM.get("english") or {}
    if english.get("kind") != "sections":
        return []
    for sec in english.get("sections") or []:
        if sec.get("key") == section_key:
            out: List[Dict[str, Any]] = []
            for les in sec.get("lessons") or []:
                lid = int(les.get("id", 0))
                out.append({
                    "id": lid,
                    "name": les.get("name") or f"Lesson {lid}",
                    "description": les.get("description") or "",
                    "chapter_id": chapter_id_for_lesson(section_key, lid),
                    "book_unit_id": None,
                    "module_skill": section_key,
                })
            return out
    return []


def _book_unit_lessons(section_type: str) -> List[Dict[str, Any]]:
    plan = _load_book_plan()
    out: List[Dict[str, Any]] = []
    for i, unit in enumerate(plan.get("units") or []):
        short = unit.get("unit_id") or f"unit_{i + 1:02d}"
        real = unit.get("real_unit_id") or f"{BOOK_ID}:{short}"
        num = i + 1
        if short.startswith("unit_"):
            try:
                num = int(short.split("_")[1])
            except ValueError:
                pass
        out.append({
            "id": num,
            "name": unit.get("title") or short,
            "description": "",
            "chapter_id": real,
            "book_unit_id": real,
            "module_skill": section_type,
        })
    return out


def english_admin_modules() -> List[Dict[str, Any]]:
    """Four English modules for admin, aligned with the student English book skills."""
    modules: List[Dict[str, Any]] = []
    for mod_def in ENGLISH_MODULE_DEFS:
        if mod_def["source"] == "portal":
            lessons = _portal_section_lessons(mod_def["portal_section_key"])
        else:
            lessons = _book_unit_lessons(mod_def["section_type"])
        modules.append({
            "subject_key": "english",
            "subject_title": "English",
            "module_key": mod_def["module_key"],
            "module_title": mod_def["module_title"],
            "icon": mod_def["icon"],
            "lessons": lessons,
        })
    return modules


def find_english_module_meta(chapter_id: str, module_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
    for mod in english_admin_modules():
        if module_key and mod["module_key"] != module_key:
            continue
        for les in mod.get("lessons") or []:
            if les.get("chapter_id") == chapter_id:
                return {
                    "subject_key": "english",
                    "subject_title": "English",
                    "module_key": mod["module_key"],
                    "module_title": mod["module_title"],
                    **les,
                }
    return None


def load_sections_catalog() -> Optional[Dict[str, Any]]:
    if not os.path.isfile(SECTIONS_PATH):
        return None
    with open(SECTIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


def section_text_for_unit(unit_id: str, section_type: str) -> Optional[str]:
    """Read stored section text from sections.json (ingested book, no regeneration)."""
    catalog = load_sections_catalog()
    if not catalog:
        return None
    short = unit_id.split(":")[-1] if ":" in unit_id else unit_id
    for unit in catalog.get("units") or []:
        if unit.get("unit_id") == short or unit.get("full_unit_id") == unit_id:
            for sec in unit.get("sections") or []:
                if sec.get("section_type") == section_type:
                    return sec.get("combined_text") or sec.get("text")
    return None


def items_for_module_skill(unit_plan: Optional[Dict[str, Any]], skill: str) -> List[Dict[str, Any]]:
    """Filter unit plan items by English book skill (grammar, vocab, listening, speaking)."""
    if not unit_plan:
        return []
    type_map = {
        "grammar": ("grammar", "exercises"),
        "vocab": ("vocab", "vocabulary", "word_study"),
        "listening": ("listening",),
        "speaking": ("speaking",),
    }
    allowed = type_map.get(skill, ())
    return [i for i in (unit_plan.get("items") or []) if i.get("type") in allowed]
