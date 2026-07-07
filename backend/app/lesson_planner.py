import json
from typing import Dict, Any

from .llm import get_teacher_llm
from .lesson_graph import retrieve_for_chapter
from .prompts import LESSON_PLAN_PROMPT
from .chapters_service import list_units
from .session_config import SESSION_UNIT_MINUTES

llm = get_teacher_llm()

def build_chapter_plan(chapter_id: str, lesson_title: str = "", lesson_description: str = "") -> Dict[str, Any]:
    # chapter_id might be "english_g6:unit_01" (a unit) or "english_g6" (a book)
    # Extract book_id: if it contains ":", take the part before ":"
    book_id = chapter_id.split(":")[0] if ":" in chapter_id else chapter_id

    # Get REAL units from manifest/Chroma for this book (not hallucinated)
    all_units = list_units()
    real_units = [u for u in all_units if u.get("book_id") == book_id]

    # Sort by unit number (unit_01, unit_02, ...)
    def extract_unit_num(unit_id: str) -> int:
        try:
            parts = unit_id.split("_")
            if len(parts) > 1:
                return int(parts[-1])
        except:
            pass
        return 0

    real_units.sort(key=lambda u: extract_unit_num(u.get("unit_id", "")))

    # If no real units found, generate a plan from the provided lesson metadata.
    # Do NOT call retrieve_for_chapter here — Chroma only has content for ingested books,
    # so querying it for an unknown book_id returns empty results, and the LLM would
    # receive zero context and generate generic filler content.
    if not real_units:
        subject_name = book_id.replace("_", " ").title()
        lines = [f"Subject: {subject_name}"]
        if lesson_title:
            lines.append(f"Lesson topic: {lesson_title}")
        if lesson_description:
            lines.append(f"Lesson overview: {lesson_description}")
        lines.append("\nCreate a focused, child-friendly unit plan for this exact lesson topic.")
        context = "\n".join(lines)
        msg = llm.invoke([
            {"role": "system", "content": LESSON_PLAN_PROMPT},
            {"role": "user", "content": context}
        ])
        text = msg.content.strip()
        start = text.find("{")
        end = text.rfind("}")
        plan = json.loads(text[start:end+1])
        for u in plan.get("units", []):
            u["minutes"] = SESSION_UNIT_MINUTES
        return plan
    
    # Use REAL units from manifest - convert to plan format
    from .unit_detection import full_unit_id, normalize_manifest_unit_id

    plan_units = []
    for u in real_units:
        raw_id = u["unit_id"]
        short_id = normalize_manifest_unit_id(raw_id, book_id)
        full_id = full_unit_id(book_id, short_id)
        plan_units.append({
            "unit_id": short_id,
            "title": u.get("title") or short_id.replace("_", " ").title(),
            "keywords": [],
            "minutes": SESSION_UNIT_MINUTES,
            "real_unit_id": full_id,
            "start_page": int(u.get("start_page") or 0),
            "end_page": int(u.get("end_page") or u.get("start_page") or 0),
        })
    
    return {
        "objectives": [f"Teach {len(plan_units)} units from {book_id} in order"],
        "units": plan_units
    }
