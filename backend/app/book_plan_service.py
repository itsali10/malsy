"""AI lesson plan generation after book ingest — reuses existing RAG + LLM stack."""

from __future__ import annotations

import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .book_registry import get_book_record, upsert_book_record
from .canonical_plan_store import (
    delete_canonical_plans_for_book,
    load_book_plan,
    load_canonical_unit_plan,
    save_book_plan,
    save_canonical_unit_plan,
)
from .lesson_planner import build_chapter_plan
from .plan_deduplication import dedupe_book_plan, dedupe_unit_plan
from .llm import get_teacher_llm
from .prompts import UNIT_PLAN_PROMPT
from .session_config import SESSION_UNIT_MINUTES
from .subject_registry import filter_unit_plan_for_subject, is_builtin_subject, is_language_subject

llm = get_teacher_llm()

PLAN_STATUSES = ("generating", "draft", "approved", "failed")

SUBJECT_PROFILES: Dict[str, Dict[str, Any]] = {
    "english": {
        "modules": [
            {"key": "grammar", "title": "Grammar"},
            {"key": "vocabulary", "title": "Vocabulary"},
            {"key": "pronunciation", "title": "Pronunciation"},
            {"key": "listening", "title": "Listening"},
            {"key": "reading", "title": "Reading"},
            {"key": "comprehension", "title": "Comprehension"},
            {"key": "exercises", "title": "Exercises"},
            {"key": "quiz", "title": "Quiz"},
        ],
        "unit_hint": (
            "This is an English language unit. Include grammar, vocabulary, pronunciation (speaking), "
            "listening, reading passages, comprehension, exercises, and quiz items where the book supports them."
        ),
        "retrieval_query": (
            "reading vocabulary grammar listening speaking pronunciation comprehension exercises quiz"
        ),
    },
    "science": {
        "modules": [
            {"key": "explanation", "title": "Lesson explanation"},
            {"key": "objectives", "title": "Learning objectives"},
            {"key": "concepts", "title": "Key scientific concepts"},
            {"key": "vocabulary", "title": "Scientific vocabulary"},
            {"key": "diagrams", "title": "Diagrams & images"},
            {"key": "experiments", "title": "Experiments & activities"},
            {"key": "summary", "title": "Summary"},
            {"key": "quiz", "title": "Quiz"},
        ],
        "unit_hint": (
            "This is a Science unit. Include lesson explanation, learning objectives, key scientific concepts, "
            "scientific vocabulary, diagrams/images (visual items), experiments or hands-on activities when "
            "applicable, summary, and quiz. Do NOT include listening, pronunciation, or speaking items."
        ),
        "retrieval_query": (
            "scientific concepts experiment diagram chart vocabulary objectives summary quiz lab activity"
        ),
    },
    "history": {
        "modules": [
            {"key": "explanation", "title": "Lesson explanation"},
            {"key": "events", "title": "Historical events"},
            {"key": "timeline", "title": "Timeline"},
            {"key": "figures", "title": "Key figures"},
            {"key": "locations", "title": "Important locations"},
            {"key": "vocabulary", "title": "Historical vocabulary"},
            {"key": "maps", "title": "Maps & images"},
            {"key": "summary", "title": "Summary"},
            {"key": "quiz", "title": "Quiz"},
        ],
        "unit_hint": (
            "This is a History unit. Include lesson explanation, historical events, timeline activities, "
            "key figures, important locations, historical vocabulary, maps/images (visual items), summary, "
            "and quiz. Do NOT include listening or pronunciation items."
        ),
        "retrieval_query": (
            "historical events timeline figures map location vocabulary story summary quiz"
        ),
    },
    "default": {
        "modules": [
            {"key": "explanation", "title": "Lesson explanation"},
            {"key": "concepts", "title": "Key concepts"},
            {"key": "vocabulary", "title": "Vocabulary"},
            {"key": "activities", "title": "Activities"},
            {"key": "summary", "title": "Summary"},
            {"key": "quiz", "title": "Quiz"},
        ],
        "unit_hint": (
            "Plan a child-friendly unit with clear lesson sections, vocabulary, interactive activities, "
            "summary, and assessment items based on the textbook content. "
            "Do NOT include listening or pronunciation unless this is a language course."
        ),
        "retrieval_query": "lesson concepts vocabulary activities summary quiz exercises",
    },
}

SCIENCE_UNIT_PLAN_PROMPT = """
You are an expert science curriculum planner. Create a strict checklist for ONE science lesson.

Return ONLY valid JSON:
{
  "unit_title": string,
  "items": [
    {
      "id": string,
      "type": "other"|"visual"|"exercises"|"vocab"|"discussion"|"wrap_up",
      "title": string,
      "must_cover": true,
      "keywords": [string, ...]
    }
  ]
}

Required item categories (use clear titles from the book when possible):
- Lesson explanation (introduce the topic)
- Learning objectives
- Key scientific concepts
- Scientific vocabulary
- Diagrams/images (type: visual) when figures or charts appear
- Experiments or activities when labs or hands-on work appear
- Summary / wrap-up
- Quiz or review questions

Rules:
- Plan ONLY from the lesson title and page-scoped excerpts provided.
- Do NOT include listening, pronunciation, or speaking items.
- Do NOT reference other units, future lessons, table of contents, or final projects.
- Order items in a natural teaching sequence.
- Every visible diagram, experiment, or activity in the lesson text must appear in the checklist.
"""

HISTORY_UNIT_PLAN_PROMPT = """
You are an expert history curriculum planner. Create a strict checklist for ONE history lesson.

Return ONLY valid JSON:
{
  "unit_title": string,
  "items": [
    {
      "id": string,
      "type": "other"|"visual"|"exercises"|"vocab"|"discussion"|"wrap_up",
      "title": string,
      "must_cover": true,
      "keywords": [string, ...]
    }
  ]
}

Required item categories (use clear titles from the book when possible):
- Lesson explanation
- Historical events
- Timeline
- Key figures
- Important locations
- Historical vocabulary
- Maps/images (type: visual) when maps or illustrations appear
- Summary
- Quiz or review questions

Rules:
- Plan ONLY from the lesson title and page-scoped excerpts provided.
- Do NOT include listening or pronunciation items.
- Do NOT reference other units, future lessons, table of contents, or final projects.
- Order items in a natural teaching sequence.
"""

LANGUAGE_UNIT_PLAN_EXTRA = """
This is a LANGUAGE course unit. You MUST include where supported by the text:
grammar, vocabulary, pronunciation/speaking, listening, reading passages, comprehension, exercises, and quiz.
"""

SUBJECT_FALLBACK_ITEMS: Dict[str, List[Dict[str, Any]]] = {
    "science": [
        {"id": "lesson_explanation", "type": "other", "title": "Lesson explanation", "must_cover": True, "keywords": []},
        {"id": "learning_objectives", "type": "other", "title": "Learning objectives", "must_cover": True, "keywords": []},
        {"id": "key_concepts", "type": "other", "title": "Key scientific concepts", "must_cover": True, "keywords": []},
        {"id": "scientific_vocabulary", "type": "vocab", "title": "Scientific vocabulary", "must_cover": True, "keywords": []},
        {"id": "diagrams", "type": "visual", "title": "Diagrams and images", "must_cover": False, "keywords": []},
        {"id": "experiments", "type": "exercises", "title": "Experiments and activities", "must_cover": False, "keywords": []},
        {"id": "summary", "type": "wrap_up", "title": "Summary", "must_cover": True, "keywords": []},
        {"id": "quiz", "type": "exercises", "title": "Quiz", "must_cover": True, "keywords": []},
    ],
    "history": [
        {"id": "lesson_explanation", "type": "other", "title": "Lesson explanation", "must_cover": True, "keywords": []},
        {"id": "historical_events", "type": "other", "title": "Historical events", "must_cover": True, "keywords": []},
        {"id": "timeline", "type": "other", "title": "Timeline", "must_cover": True, "keywords": []},
        {"id": "key_figures", "type": "other", "title": "Key figures", "must_cover": True, "keywords": []},
        {"id": "locations", "type": "other", "title": "Important locations", "must_cover": True, "keywords": []},
        {"id": "historical_vocabulary", "type": "vocab", "title": "Historical vocabulary", "must_cover": True, "keywords": []},
        {"id": "maps", "type": "visual", "title": "Maps and images", "must_cover": False, "keywords": []},
        {"id": "summary", "type": "wrap_up", "title": "Summary", "must_cover": True, "keywords": []},
        {"id": "quiz", "type": "exercises", "title": "Quiz", "must_cover": True, "keywords": []},
    ],
    "english": [
        {"id": "grammar", "type": "grammar", "title": "Grammar", "must_cover": True, "keywords": []},
        {"id": "vocabulary", "type": "vocab", "title": "Vocabulary", "must_cover": True, "keywords": []},
        {"id": "pronunciation", "type": "speaking", "title": "Pronunciation", "must_cover": True, "keywords": []},
        {"id": "listening", "type": "listening", "title": "Listening", "must_cover": True, "keywords": []},
        {"id": "reading", "type": "reading", "title": "Reading", "must_cover": True, "keywords": []},
        {"id": "comprehension", "type": "reading", "title": "Comprehension", "must_cover": True, "keywords": []},
        {"id": "exercises", "type": "exercises", "title": "Exercises", "must_cover": True, "keywords": []},
        {"id": "quiz", "type": "exercises", "title": "Quiz", "must_cover": True, "keywords": []},
    ],
}

ENRICH_PLAN_PROMPT = """
You are an expert curriculum designer. Given a book's unit outline and sample textbook excerpts,
enrich the lesson plan for admin review.

Return ONLY valid JSON:
{
  "objectives": [string, ...],
  "units": [
    {
      "unit_id": string,
      "title": string,
      "keywords": [string, ...],
      "minutes": number,
      "module_key": string,
      "real_unit_id": string (optional, preserve if provided)
    }
  ]
}

Rules:
- Keep the SAME number of units and the SAME unit_id order as the input outline.
- Assign each unit to exactly one module_key from the provided module list.
- Titles should be child-friendly and reflect the book content.
- keywords: 3-6 key concepts per unit drawn from the excerpts.
- minutes: use the value from the input outline for each unit.
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def subject_profile(subject_key: str) -> Dict[str, Any]:
    key = (subject_key or "").lower().strip()
    if is_language_subject(key) and key not in SUBJECT_PROFILES:
        return SUBJECT_PROFILES["english"]
    return SUBJECT_PROFILES.get(key) or SUBJECT_PROFILES["default"]


def plan_layout_for_subject(subject_key: str) -> str:
    """English maps book-units to modules; Science/History map unit-plan items to modules."""
    return "unit_modules" if is_language_subject(subject_key) else "item_modules"


def map_plan_item_to_module(
    item: Dict[str, Any],
    modules: List[Dict[str, Any]],
    subject_key: str,
) -> Optional[str]:
    """Map a canonical unit-plan checklist item to a subject module key."""
    title = (item.get("title") or "").lower()
    item_type = (item.get("type") or "").lower()
    item_id = (item.get("id") or "").lower()
    module_keys = {m.get("key") for m in modules if m.get("key")}

    def pick(*candidates: str) -> Optional[str]:
        for c in candidates:
            if c in module_keys:
                return c
        return None

    key = (subject_key or "").lower().strip()

    if key == "science":
        if any(w in title for w in ("quiz", "review question", "assessment")):
            return pick("quiz")
        if any(w in title for w in ("summary", "wrap-up", "wrap up")):
            return pick("summary")
        if any(w in title for w in ("experiment", "activit", "lab", "hands-on")):
            return pick("experiments")
        if item_type == "visual" or any(w in title for w in ("diagram", "image", "chart", "figure")):
            return pick("diagrams")
        if item_type in ("vocab", "vocabulary") or "vocabulary" in title:
            return pick("vocabulary")
        if any(w in title for w in ("objective", "learning goal")):
            return pick("objectives")
        if any(w in title for w in ("concept", "scientific method", "key idea")):
            return pick("concepts")
        if any(w in title for w in ("explanation", "introduction", "lesson", "unit opening")):
            return pick("explanation")
        if item_type == "wrap_up":
            return pick("summary")
        if item_type == "exercises":
            return pick("experiments", "quiz")
        if item_type == "other":
            if "objective" in item_id:
                return pick("objectives")
            if "concept" in item_id:
                return pick("concepts")
            return pick("explanation", "concepts")
        return pick("concepts", "explanation")

    if key == "history":
        if any(w in title for w in ("quiz", "review", "assessment")):
            return pick("quiz") or pick("summary")
        if any(w in title for w in ("summary", "wrap-up", "wrap up")):
            return pick("summary")
        if item_type == "visual" or any(w in title for w in ("map", "image", "illustration")):
            return pick("maps")
        if any(w in title for w in ("timeline", "chronolog")):
            return pick("timeline")
        if any(w in title for w in ("figure", "leader", "person", "pharaoh", "king", "queen")):
            return pick("figures")
        if any(w in title for w in ("location", "place", "geograph", "where")):
            return pick("locations")
        if any(w in title for w in ("event", "battle", "war", "revolution")):
            return pick("events")
        if item_type in ("vocab", "vocabulary") or "vocabulary" in title:
            return pick("vocabulary")
        if any(w in title for w in ("explanation", "introduction", "overview")):
            return pick("explanation")
        return pick("events", "explanation")

    # Default / non-language
    if any(w in title for w in ("quiz", "review", "assessment")):
        return pick("quiz", "assessments")
    if any(w in title for w in ("summary", "wrap")):
        return pick("summary", "wrap_up")
    if item_type in ("vocab", "vocabulary") or "vocabulary" in title:
        return pick("vocabulary")
    if item_type == "visual":
        return pick("diagrams", "maps", "visual")
    if item_type == "exercises":
        return pick("experiments", "activities", "exercises")
    return pick("explanation", "concepts", "lessons")


def build_modules_with_items(
    modules: List[Dict[str, Any]],
    units_out: List[Dict[str, Any]],
    subject_key: str,
) -> List[Dict[str, Any]]:
    """Attach unit-plan checklist items to subject modules (Science/History layout)."""
    buckets: Dict[str, List[Dict[str, Any]]] = {m.get("key", ""): [] for m in modules if m.get("key")}

    for unit in units_out:
        unit_plan = unit.get("unit_plan") or {}
        parent_title = unit.get("title") or unit_plan.get("unit_title") or unit.get("unit_id")
        real_id = unit.get("real_unit_id") or unit.get("unit_id")
        for item in unit_plan.get("items") or []:
            module_key = map_plan_item_to_module(item, modules, subject_key)
            if not module_key or module_key not in buckets:
                continue
            buckets[module_key].append(
                {
                    "id": item.get("id"),
                    "type": item.get("type"),
                    "title": item.get("title") or item.get("id"),
                    "keywords": item.get("keywords") or [],
                    "must_cover": item.get("must_cover", True),
                    "unit_id": unit.get("unit_id"),
                    "unit_title": parent_title,
                    "real_unit_id": real_id,
                }
            )

    out: List[Dict[str, Any]] = []
    for mod in modules:
        key = mod.get("key", "")
        out.append({**mod, "items": buckets.get(key, [])})
    return out


def _unit_plan_system_prompt(subject_key: str) -> str:
    key = (subject_key or "").lower().strip()
    profile = subject_profile(key)
    hint = profile.get("unit_hint", "")
    if is_language_subject(key):
        return f"{UNIT_PLAN_PROMPT}\n\n{LANGUAGE_UNIT_PLAN_EXTRA}\n\nSubject-specific guidance:\n{hint}"
    if key == "science":
        return f"{SCIENCE_UNIT_PLAN_PROMPT}\n\nSubject-specific guidance:\n{hint}"
    if key == "history":
        return f"{HISTORY_UNIT_PLAN_PROMPT}\n\nSubject-specific guidance:\n{hint}"
    lang_note = ""
    if not is_language_subject(key):
        lang_note = "\nDo NOT include listening, pronunciation, or speaking items."
    return f"{UNIT_PLAN_PROMPT}\n\nSubject-specific guidance:\n{hint}{lang_note}"


def _fallback_unit_plan(subject_key: str, title: str, keywords: List[str]) -> Dict[str, Any]:
    key = (subject_key or "").lower().strip()
    if is_language_subject(key):
        template_key = "english"
    elif key in SUBJECT_FALLBACK_ITEMS:
        template_key = key
    else:
        template_key = "science"

    items = []
    for item in SUBJECT_FALLBACK_ITEMS.get(template_key, SUBJECT_FALLBACK_ITEMS["science"]):
        copy = dict(item)
        if keywords:
            copy["keywords"] = list(keywords)
        items.append(copy)
    return {"unit_title": title, "items": items}


def _parse_llm_json(text: str) -> Any:
    from .lesson_graph import json_safe

    return json_safe(text)


def is_plan_approved_for_students(book_id: str) -> bool:
    rec = get_book_record(book_id)
    if rec:
        status = rec.get("plan_status")
        if status == "approved":
            return True
        if status in ("generating", "draft", "failed"):
            return False
    plan = load_book_plan(book_id)
    if plan and plan.get("plan_status") == "approved":
        return True
    # Grandfather built-in / legacy books that already have a plan file.
    if plan and not plan.get("plan_status"):
        subj = (rec or {}).get("subject") or book_id.split("_")[0]
        if is_builtin_subject(str(subj)) or (rec and rec.get("status") == "processed"):
            return True
    return False


def load_approved_canonical_unit_plan(book_id: str, plan_key: str) -> Optional[Dict[str, Any]]:
    if not is_plan_approved_for_students(book_id):
        return None
    return load_canonical_unit_plan(book_id, plan_key)


def _enrich_chapter_plan(
    book_id: str,
    skeleton: Dict[str, Any],
    subject_key: str,
    book_title: str,
) -> Dict[str, Any]:
    """Attach subject modules to the unit skeleton without whole-book LLM enrichment."""
    profile = subject_profile(subject_key)
    modules = profile["modules"]
    module_keys = [m["key"] for m in modules]
    units_in = skeleton.get("units") or []
    objectives = skeleton.get("objectives") or [
        f"Teach {len(units_in)} lessons from {book_title} in order"
    ]

    for i, u in enumerate(units_in):
        u.setdefault("keywords", [])
        u.setdefault("minutes", SESSION_UNIT_MINUTES)
        if u.get("module_key") not in module_keys:
            u["module_key"] = module_keys[i % len(module_keys)] if module_keys else "lessons"

    return {
        "objectives": objectives,
        "units": units_in,
        "modules": modules,
        "subject_key": subject_key,
    }


def _generate_canonical_unit_plan(
    book_id: str,
    unit: Dict[str, Any],
    subject_key: str,
) -> Dict[str, Any]:
    from .lesson_content_mapping import (
        build_lesson_plan_context,
        detect_english_section_headings,
        extract_headings_from_chunks,
        filter_english_plan_to_detected_sections,
        forbidden_lesson_titles,
        retrieve_lesson_pages_for_plan,
        resolve_lesson_for_planning,
        validate_plan_lesson_scope,
    )
    from .unit_detection import full_unit_id, normalize_manifest_unit_id

    profile = subject_profile(subject_key)
    short = normalize_manifest_unit_id(unit.get("unit_id") or unit.get("real_unit_id") or "unit_01", book_id)
    real_id = unit.get("real_unit_id") or full_unit_id(book_id, short)
    if book_id in str(real_id) and str(real_id).count(":") > 1:
        real_id = full_unit_id(book_id, short)

    lesson_info = resolve_lesson_for_planning(book_id, real_id, unit)
    title = lesson_info["title"]
    keywords = unit.get("keywords") or []

    plan_unit = dict(unit)
    plan_unit.setdefault("unit_id", lesson_info["unit_id"])
    plan_unit.setdefault("real_unit_id", lesson_info["lesson_id"])
    plan_unit.setdefault("title", title)
    plan_unit["start_page"] = lesson_info["start_page"]
    plan_unit["end_page"] = lesson_info["end_page"]

    chunks, mapping = retrieve_lesson_pages_for_plan(
        lesson_info["lesson_id"],
        book_id=book_id,
        plan_unit=plan_unit,
        max_chunks=24,
    )
    if is_language_subject(subject_key):
        from .english_section_segmentation import (
            log_english_section_debug,
            validate_english_section_assignment,
        )

        section_validation = validate_english_section_assignment(
            chunks,
            lesson_title=title,
            next_lesson=lesson_info.get("next_lesson"),
            previous_lesson=lesson_info.get("previous_lesson"),
        )
        log_english_section_debug(
            lesson_title=title,
            chunks=chunks,
            validation=section_validation,
        )
        if not section_validation.get("ok"):
            raise ValueError(
                "English section validation failed: "
                + "; ".join(section_validation.get("errors") or [])
            )
    start_page = int(
        mapping.get("start_page")
        or lesson_info["start_page"]
        or plan_unit.get("start_page")
        or 0
    )
    end_page = int(
        mapping.get("end_page")
        or lesson_info["end_page"]
        or plan_unit.get("end_page")
        or start_page
    )
    forbidden = forbidden_lesson_titles(book_id, lesson_info["unit_id"])
    detected_sections = extract_headings_from_chunks(chunks)
    context = build_lesson_plan_context(
        title=title,
        start_page=start_page,
        end_page=end_page,
        chunks=chunks,
        subject_key=subject_key,
        detected_sections=detected_sections,
    )
    system = _unit_plan_system_prompt(subject_key)
    try:
        msg = llm.invoke(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": context},
            ]
        )
        plan = _parse_llm_json(msg.content)
        plan.setdefault("unit_title", title)
        items = plan.get("items") or []
        if not items:
            raise ValueError("empty items")
        plan = filter_unit_plan_for_subject(plan, subject_key) or plan
        plan = validate_plan_lesson_scope(
            plan,
            lesson_title=title,
            forbidden_titles=forbidden,
        )
        if is_language_subject(subject_key):
            plan = filter_english_plan_to_detected_sections(
                plan,
                detect_english_section_headings(chunks),
            )
        return plan
    except Exception:
        traceback.print_exc()
        fallback = _fallback_unit_plan(subject_key, title, keywords)
        fallback = validate_plan_lesson_scope(
            fallback,
            lesson_title=title,
            forbidden_titles=forbidden,
        )
        if is_language_subject(subject_key):
            fallback = filter_english_plan_to_detected_sections(
                fallback,
                detect_english_section_headings(chunks),
            )
        return fallback


def _sanitize_saved_unit_plan(plan: Dict[str, Any], subject_key: str) -> Dict[str, Any]:
    filtered = filter_unit_plan_for_subject(plan, subject_key) or plan
    return dedupe_unit_plan(filtered)


def _sanitize_saved_book_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    return dedupe_book_plan(plan)


def generate_book_lesson_plan(book_id: str, *, force: bool = False) -> Dict[str, Any]:
    """Build chapter + unit plans from ingested RAG content. Stores draft until admin approves."""
    rec = get_book_record(book_id) or {}
    subject_key = (rec.get("subject") or book_id.split("_")[0]).lower()
    book_title = rec.get("title") or book_id

    if not force:
        existing = load_book_plan(book_id)
        existing_status = (rec.get("plan_status") or (existing or {}).get("plan_status"))
        if existing_status == "approved" and existing:
            from .lesson_content_mapping import ensure_book_ready_for_students, plan_is_stale, refresh_plan_units_from_chroma

            ensure_book_ready_for_students(book_id)
            if plan_is_stale(book_id, existing):
                existing = refresh_plan_units_from_chroma(book_id, existing)
                save_book_plan(book_id, existing)
            return existing
        if existing_status == "draft" and existing:
            from .lesson_content_mapping import plan_is_stale

            if not plan_is_stale(book_id, existing):
                return existing

    upsert_book_record(book_id, plan_status="generating", plan_error=None)

    try:
        skeleton = build_chapter_plan(book_id)
        plan = _enrich_chapter_plan(book_id, skeleton, subject_key, book_title)
        plan = _sanitize_saved_book_plan(plan)
        plan["plan_status"] = "draft"
        plan["generated_at"] = _now_iso()
        plan["book_id"] = book_id
        plan["book_title"] = book_title

        delete_canonical_plans_for_book(book_id)
        for unit in plan.get("units") or []:
            from .unit_detection import full_unit_id, normalize_manifest_unit_id

            short = normalize_manifest_unit_id(unit.get("unit_id") or "unit_01", book_id)
            real_id = full_unit_id(book_id, short)
            unit["unit_id"] = short
            unit["real_unit_id"] = real_id
            unit_plan = _generate_canonical_unit_plan(book_id, unit, subject_key)
            unit_plan = _sanitize_saved_unit_plan(unit_plan, subject_key)
            save_canonical_unit_plan(book_id, real_id, unit_plan)
            save_canonical_unit_plan(book_id, short, unit_plan)

        save_book_plan(book_id, plan)
        upsert_book_record(
            book_id,
            plan_status="draft",
            plan_generated_at=plan["generated_at"],
            plan_error=None,
        )
        try:
            from .lesson_content_mapping import ensure_book_ready_for_students

            ensure_book_ready_for_students(book_id)
        except Exception:
            traceback.print_exc()
        return plan
    except Exception as exc:
        traceback.print_exc()
        upsert_book_record(book_id, plan_status="failed", plan_error=str(exc))
        raise


def approve_book_plan(book_id: str) -> Dict[str, Any]:
    rec = get_book_record(book_id) or {}
    if rec.get("plan_status") == "approved":
        return load_book_plan(book_id) or {}
    plan = load_book_plan(book_id)
    if not plan:
        raise ValueError("No lesson plan exists for this book")
    status = rec.get("plan_status") or plan.get("plan_status")
    if status not in ("draft", None):
        raise ValueError("Only draft plans can be approved")
    plan["plan_status"] = "approved"
    plan["approved_at"] = _now_iso()
    save_book_plan(book_id, plan)
    upsert_book_record(
        book_id,
        plan_status="approved",
        plan_approved_at=plan["approved_at"],
        plan_error=None,
    )
    try:
        from .book_lessons_catalog import sync_lessons_catalog_from_manifest

        sync_lessons_catalog_from_manifest(book_id)
    except Exception:
        traceback.print_exc()
    try:
        from .lesson_content_mapping import ensure_book_ready_for_students

        ensure_book_ready_for_students(book_id)
    except Exception:
        traceback.print_exc()
    return plan


def update_book_plan_units(book_id: str, unit_updates: List[Dict[str, Any]]) -> Dict[str, Any]:
    plan = load_book_plan(book_id)
    if not plan:
        raise ValueError("No lesson plan exists for this book")
    updates_by_id = {u.get("unit_id"): u for u in unit_updates if u.get("unit_id")}
    units = plan.get("units") or []
    for u in units:
        upd = updates_by_id.get(u.get("unit_id"))
        if not upd:
            continue
        if upd.get("title"):
            u["title"] = str(upd["title"]).strip()
        if upd.get("module_key"):
            u["module_key"] = upd["module_key"]
    plan["units"] = units
    save_book_plan(book_id, plan)
    return plan


def get_admin_plan_view(book_id: str) -> Dict[str, Any]:
    rec = get_book_record(book_id) or {}
    plan = load_book_plan(book_id)
    subject_key = (plan or {}).get("subject_key") or rec.get("subject") or book_id.split("_")[0]
    subject_key = str(subject_key).lower()
    modules = (plan or {}).get("modules") or subject_profile(subject_key).get("modules", [])
    layout = plan_layout_for_subject(subject_key)

    units_out: List[Dict[str, Any]] = []
    for u in (plan or {}).get("units") or []:
        short = u.get("unit_id") or ""
        real_id = u.get("real_unit_id") or f"{book_id}:{short}"
        up = load_canonical_unit_plan(book_id, real_id) or load_canonical_unit_plan(book_id, short)
        units_out.append({**u, "unit_plan": up})

    modules_view = (
        build_modules_with_items(modules, units_out, subject_key)
        if layout == "item_modules"
        else [{**m, "items": []} for m in modules]
    )

    return {
        "book_id": book_id,
        "plan_status": rec.get("plan_status") or (plan or {}).get("plan_status"),
        "plan_generated_at": rec.get("plan_generated_at") or (plan or {}).get("generated_at"),
        "plan_approved_at": rec.get("plan_approved_at") or (plan or {}).get("approved_at"),
        "plan_error": rec.get("plan_error"),
        "objectives": (plan or {}).get("objectives") or [],
        "modules": modules_view,
        "subject_key": subject_key,
        "plan_layout": layout,
        "units": units_out,
    }
