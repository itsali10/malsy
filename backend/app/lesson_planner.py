import json
from typing import Dict, Any

from .llm import get_teacher_llm
from .lesson_graph import retrieve_for_chapter
from .prompts import LESSON_PLAN_PROMPT
from .chapters_service import list_units
from .session_config import SESSION_UNIT_MINUTES

llm = get_teacher_llm()

def build_chapter_plan(chapter_id: str) -> Dict[str, Any]:
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
    
    # If no real units found, fall back to LLM generation (but warn)
    if not real_units:
        chunks = retrieve_for_chapter(chapter_id, "outline headings main topics key definitions", k=16)
        context = "\n\n".join(c["text"] for c in chunks)
        msg = llm.invoke([
            {"role": "system", "content": LESSON_PLAN_PROMPT},
            {"role": "user", "content": f"Chapter context:\n{context}\n\nCreate the unit plan."}
        ])
        text = msg.content.strip()
        start = text.find("{")
        end = text.rfind("}")
        plan = json.loads(text[start:end+1])
        for u in plan.get("units", []):
            u["minutes"] = SESSION_UNIT_MINUTES
        return plan
    
    # Use REAL units from manifest - convert to plan format
    plan_units = []
    for u in real_units:
        # Extract short unit_id (e.g., "english_g6:unit_01" -> "unit_01")
        short_id = u["unit_id"].split(":")[-1] if ":" in u["unit_id"] else u["unit_id"]
        plan_units.append({
            "unit_id": short_id,  # "unit_01", "unit_02", etc.
            "title": u["title"],
            "keywords": [],  # Can be filled by LLM later if needed
            "minutes": SESSION_UNIT_MINUTES,
            "real_unit_id": u["unit_id"]  # Keep full ID for reference
        })
    
    return {
        "objectives": [f"Teach {len(plan_units)} units from {book_id} in order"],
        "units": plan_units
    }
