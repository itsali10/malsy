"""Portal curriculum — legacy fallback for subjects without uploaded books.

Source of truth for book-based subjects (English G6, Science G6, etc.):
  backend/data/books/{book_id}/lessons.json  via lesson_catalog_service.py
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# Keep in sync with learning-config.ts (english, science, history on /lessons hub).
PORTAL_CURRICULUM: Dict[str, Dict[str, Any]] = {
    "english": {
        "kind": "sections",
        "title": "English",
        "icon": "📖",
        "sections": [
            {
                "key": "english_speaking",
                "title": "Pronunciation",
                "icon": "🎤",
                "lessons": [
                    {
                        "id": 1,
                        "name": "Pronunciation Practice",
                        "description": "Phonemes, stress patterns, and spoken fluency.",
                    },
                ],
            },
            {
                "key": "english_grammar",
                "title": "Grammar",
                "icon": "✏️",
                "lessons": [
                    {"id": 1, "name": "Grammar Foundations", "description": "Parts of speech, sentence basics, and punctuation."},
                    {"id": 2, "name": "Sentence Structure", "description": "Simple, compound, and complex sentence building."},
                    {"id": 3, "name": "Vocabulary Growth", "description": "Context clues, synonyms, and antonyms."},
                    {"id": 4, "name": "Writing Paragraphs", "description": "Topic sentences, cohesion, and transitions."},
                ],
            },
            {
                "key": "english_comprehension",
                "title": "Comprehension",
                "icon": "📚",
                "lessons": [
                    {"id": 1, "name": "Reading Comprehension", "description": "Main idea, supporting details, and inference."},
                    {"id": 2, "name": "Narrative Writing", "description": "Story sequence, characters, and setting."},
                    {"id": 3, "name": "Informative Writing", "description": "Explaining ideas with clear evidence."},
                    {"id": 4, "name": "Final English Review", "description": "Revision practice and readiness check."},
                ],
            },
        ],
    },
    "science": {
        "kind": "linear",
        "title": "Science",
        "icon": "🔬",
        "lessons": [
            {"id": 1, "name": "Scientific Method", "description": "Questions, hypotheses, and controlled experiments."},
            {"id": 2, "name": "States of Matter", "description": "Solids, liquids, gases, and particle motion."},
            {"id": 3, "name": "Atoms and Elements", "description": "Atomic structure and periodic table basics."},
            {"id": 4, "name": "Compounds and Mixtures", "description": "How materials combine and separate."},
            {"id": 5, "name": "Chemical Reactions", "description": "Signs of reaction and equation basics."},
            {"id": 6, "name": "Acids and Bases", "description": "pH scale, indicators, and safety."},
            {"id": 7, "name": "Energy and Heat", "description": "Exothermic and endothermic changes."},
            {"id": 8, "name": "Lab Safety Mastery", "description": "Safety procedures before advanced labs."},
            {"id": 9, "name": "Science Review", "description": "Full review before practical assessment."},
        ],
    },
    "history": {
        "kind": "sections",
        "title": "Social Studies",
        "icon": "🏛️",
        "sections": [
            {
                "key": "history_g6",
                "title": "History",
                "icon": "🏛️",
                "lessons": [
                    {"id": 1, "name": "Where and Who Were the Ancient Egyptians?", "description": "Location of Egypt, the Nile, settlement, Upper and Lower Egypt, and unification."},
                    {"id": 2, "name": "Religion and Gods of Ancient Egypt", "description": "Egyptian gods, animal-headed deities, and what each god represented."},
                    {"id": 3, "name": "Egyptian Society and the Pharaohs", "description": "Social hierarchy, pharaohs, pyramids, Valley of the Kings, and Tutankhamun."},
                    {"id": 4, "name": "Mummification and the Afterlife", "description": "Why bodies were preserved, the 70-day process, and afterlife beliefs."},
                    {"id": 5, "name": "Fashion and Daily Life in Ancient Egypt", "description": "Clothing, linen, jewellery, makeup, and daily dress in Ancient Egypt."},
                    {"id": 6, "name": "Hieroglyphics and Ancient Writing", "description": "Picture writing, scribes, papyrus, and the Rosetta Stone."},
                ],
            },
            {
                "key": "geography",
                "title": "Geography",
                "icon": "🗺️",
                "lessons": [
                    {"id": 1, "name": "Maps and Coordinates", "description": "Map reading, scale, and coordinates."},
                    {"id": 2, "name": "Physical Geography", "description": "Landforms, water systems, and climate."},
                    {"id": 3, "name": "Human Geography", "description": "Population, culture, and settlements."},
                    {"id": 4, "name": "Regions of the World", "description": "Comparing regions, resources, and lifestyles."},
                ],
            },
        ],
    },
}


def chapter_id_for_lesson(section_key: str, lesson_id: int) -> str:
    return f"{section_key}:unit_{lesson_id:02d}"


def portal_modules() -> List[Dict[str, Any]]:
    """Flat list of student-visible modules (Grammar, Pronunciation, etc.)."""
    modules: List[Dict[str, Any]] = []
    for subject_key, cfg in PORTAL_CURRICULUM.items():
        if cfg["kind"] == "sections":
            for sec in cfg["sections"]:
                lessons = []
                for les in sec["lessons"]:
                    lessons.append({
                        **les,
                        "chapter_id": chapter_id_for_lesson(sec["key"], les["id"]),
                    })
                modules.append({
                    "subject_key": subject_key,
                    "subject_title": cfg["title"],
                    "module_key": sec["key"],
                    "module_title": sec["title"],
                    "icon": sec.get("icon", cfg.get("icon", "")),
                    "lessons": lessons,
                })
        else:
            lessons = []
            for les in cfg["lessons"]:
                lessons.append({
                    **les,
                    "chapter_id": chapter_id_for_lesson(subject_key, les["id"]),
                })
            modules.append({
                "subject_key": subject_key,
                "subject_title": cfg["title"],
                "module_key": subject_key,
                "module_title": cfg["title"],
                "icon": cfg.get("icon", ""),
                "lessons": lessons,
            })
    return modules


def portal_module_count() -> int:
    return len(portal_modules())


def portal_modules_for_admin(grade: int = 6) -> List[Dict[str, Any]]:
    """Admin view: primary-book catalogs for all subjects that have uploaded books."""
    from .lesson_catalog_service import portal_modules_from_books

    book_modules = portal_modules_from_books(grade=grade)
    covered = {m.get("subject_key") for m in book_modules}
    legacy = [m for m in portal_modules() if m.get("subject_key") not in covered]
    return book_modules + legacy


def admin_portal_module_count() -> int:
    return len(portal_modules_for_admin())


def find_lesson_meta(chapter_id: str) -> Optional[Dict[str, Any]]:
    """Resolve lesson metadata — book catalog first, portal curriculum as legacy fallback."""
    from .lesson_catalog_service import resolve_lesson_meta

    shared = resolve_lesson_meta(chapter_id)
    if shared.get("source") in ("book_catalog", "history_catalog"):
        book_key = shared.get("book_id") or chapter_id.split(":")[0]
        subject_key = book_key.split("_")[0] if "_" in book_key else book_key
        return {
            "subject_key": subject_key,
            "subject_title": subject_key.replace("_", " ").title(),
            "module_key": book_key,
            "module_title": book_key.replace("_", " ").title(),
            "name": shared.get("title"),
            "description": shared.get("description") or "",
            "chapter_id": shared.get("chapter_id"),
            "id": shared.get("lesson_number"),
        }

    book_key = chapter_id.split(":")[0] if ":" in chapter_id else chapter_id
    for mod in portal_modules():
        if mod["module_key"] == book_key or book_key.startswith(mod["module_key"]):
            for les in mod["lessons"]:
                if les.get("chapter_id") == chapter_id:
                    return {
                        "subject_key": mod["subject_key"],
                        "subject_title": mod["subject_title"],
                        "module_key": mod["module_key"],
                        "module_title": mod["module_title"],
                        **les,
                    }
    return None
