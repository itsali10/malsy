from datetime import datetime, timezone
from typing import TypedDict, List, Dict, Any, Optional, Optional
from langgraph.graph import StateGraph, END
import re

from .db import get_chroma_client, get_collection
from .embeddings import get_embedder
from .llm import get_teacher_llm
from .evaluation_store import record_quiz_attempt, eval_summary
from .recommendations import build_recommendations
from .prompts import (
    UNIT_PLAN_PROMPT,
    TEACH_ITEM_PROMPT,
    COVERAGE_GUARD_PROMPT,
    QUIZ_PROMPT,
    EVAL_PROMPT,
    HINT_PROMPT,
    REMEDIAL_PROMPT,
    ADVANCE_PROMPT,
    LISTENING_STORY_PROMPT,
)
from .teacher_prompt_pack import (
    MASTER_SYSTEM_PROMPT,
    LESSON_ANALYSIS_PROMPT,
    TURN_GENERATOR_PROMPT,
    VALIDATION_PROMPT,
)
from .unit_plan_store import load_unit_plan, save_unit_plan
from .progress_store import load_unit_progress, save_unit_progress
from .session_config import SESSION_UNIT_MINUTES, SESSION_HALVES_PER_UNIT

llm = get_teacher_llm()
embedder = get_embedder(device="cpu")


# -------------------------
# STATE
# -------------------------

class LessonState(TypedDict):
    student_id: str
    chapter_id: str
    # Full unit payload from /session/* (must survive the graph for evaluate_answer + recommendations)
    current_unit: Optional[Dict[str, Any]]
    # passed in by /session/answer so we grade the SAME quiz
    provided_quiz: Optional[Dict[str, Any]]
    student_answer: str
    unit_plan: Dict[str, Any]
    progress: Dict[str, Any]
    current_item: Dict[str, Any]
    retrieved_chunks: List[Dict[str, Any]]
    teacher_text: str
    quiz: Dict[str, Any]
    evaluation: Dict[str, Any]
    hint_text: str
    hint_count: int  # Track number of hints given (0, 1, or 2)
    remediation_text: str
    advance_text: str
    tutor_quality: Dict[str, Any]
    evaluation_summary: Dict[str, Any]
    recommendations: Dict[str, Any]
    done: bool


# -------------------------
# HELPERS
# -------------------------

def retrieve_for_item(unit_id: str, query: str, k: int = 8, unit_part: Optional[int] = None, unit_pages: Optional[Dict[str, Any]] = None):
    """
    Retrieve chunks for a unit, optionally filtered by page range.
    
    Args:
        unit_id: Full unit ID (e.g., "english_g6:unit_01")
        query: Search query
        k: Number of chunks to retrieve
        unit_part: 0 = first half (pages 1-5), 1 = second half (pages 6-10), None = all pages
        unit_pages: Dict with start_page and end_page (book pages from manifest)
    """
    client = get_chroma_client("chroma_db")
    col = get_collection(client, "pdf_chunks")

    qv = embedder.embed_query(query)
    
    # Build where clause
    where_clause = {"unit_id": unit_id}
    
    # Retrieve more chunks initially if we need to filter by page
    # We'll filter after retrieval since ChromaDB doesn't support range queries on metadata easily
    retrieve_k = k * 3 if unit_part is not None else k  # Get 3x more to filter from
    
    res = col.query(
        query_embeddings=[qv],
        n_results=retrieve_k,
        where=where_clause,
    )

    chunks = []
    for i in range(len(res["documents"][0])):
        chunk_meta = res["metadatas"][0][i]
        chunk_text = res["documents"][0][i]
        
        # Filter by page range if unit_part is specified
        if unit_part is not None and unit_pages:
            start_page = unit_pages.get("start_page", 0)
            end_page = unit_pages.get("end_page", 0)
            if start_page > 0 and end_page > 0:
                total_pages = end_page - start_page + 1
                if unit_part == 0:
                    part_start = start_page
                    part_end = start_page + (total_pages // 2) - 1
                else:
                    part_start = start_page + (total_pages // 2)
                    part_end = end_page
                pdf_page = chunk_meta.get("pdf_page")
                if pdf_page is not None and int(pdf_page) > 0:
                    if int(pdf_page) < int(part_start) or int(pdf_page) > int(part_end):
                        continue
        
        chunks.append({
            "text": chunk_text,
            "meta": chunk_meta,
        })
    
    # CRITICAL: Sort chunks by page number to ensure sequential order
    # This ensures the AI teacher follows the book's page order
    chunks.sort(key=lambda c: c["meta"].get("pdf_page", 0))
    
    # If we filtered, limit to k chunks
    if unit_part is not None and len(chunks) > k:
        chunks = chunks[:k]
    
    return chunks


def _format_json_for_prompt(obj: Any) -> str:
    try:
        import json
        return json.dumps(obj, ensure_ascii=True)
    except Exception:
        return str(obj)


def _invoke_json(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    msg = llm.invoke([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])
    parsed = json_safe(msg.content)
    return parsed if isinstance(parsed, dict) else {}


def _generate_guided_teacher_text(*, context: str, unit_title: str = "") -> str:
    """
    New strict pipeline:
      1) Analyze lesson content
      2) Generate short turns by step
      3) Validate each turn against textbook grounding
    """
    analysis = _invoke_json(
        MASTER_SYSTEM_PROMPT,
        LESSON_ANALYSIS_PROMPT.format(book_text=context),
    )

    steps = ["intro", "explain", "example", "question", "summary"]
    turns: List[str] = []
    for step in steps:
        turn_obj = _invoke_json(
            MASTER_SYSTEM_PROMPT,
            TURN_GENERATOR_PROMPT.format(
                analysis_json=_format_json_for_prompt(analysis),
                step_type=step,
                student_state="first_turn",
            ),
        )
        teacher_turn = str(turn_obj.get("teacher_turn", "")).strip()
        if not teacher_turn:
            continue

        val = _invoke_json(
            MASTER_SYSTEM_PROMPT,
            VALIDATION_PROMPT.format(
                book_text=context,
                teacher_turn=teacher_turn,
            ),
        )
        approved = bool(val.get("approved", False))
        fixed_turn = str(val.get("fixed_turn", "")).strip()
        final_turn = teacher_turn if approved else (fixed_turn or teacher_turn)
        if final_turn:
            turns.append(final_turn)

    if unit_title:
        title_line = f"Today our lesson is {unit_title}."
        if not turns:
            turns = [title_line]
        else:
            turns.insert(0, title_line)

    # Keep result concise and speech-friendly.
    return "\n\n".join(turns[:8]).strip()


def _enforce_kid_friendly_delivery(text: str) -> str:
    """
    Post-process generated teaching text for spoken avatar delivery.
    Goal: keep content meaning while making spoken output easier for Grade 6.
    """
    raw = str(text or "").strip()
    if not raw:
        return raw

    # Remove markdown-heavy symbols that sound awkward in TTS.
    cleaned = raw
    cleaned = re.sub(r"[*_`#>]", "", cleaned)
    cleaned = re.sub(r"^\s*[-•]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    def split_long_sentence(sentence: str, max_words: int = 20) -> List[str]:
        sent = sentence.strip()
        if not sent:
            return []
        words = sent.split()
        if len(words) <= max_words:
            return [sent]

        # First try punctuation-based split.
        parts = [p.strip() for p in re.split(r"[,;:]\s+", sent) if p.strip()]
        if len(parts) > 1:
            out: List[str] = []
            for p in parts:
                out.extend(split_long_sentence(p, max_words=max_words))
            return out

        # Fallback hard split by word count.
        out = []
        i = 0
        while i < len(words):
            out.append(" ".join(words[i:i + max_words]))
            i += max_words
        return out

    # Split into sentence-like chunks.
    sentence_candidates = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    simplified: List[str] = []
    for s in sentence_candidates:
        simplified.extend(split_long_sentence(s, max_words=20))

    # Build short teaching chunks (2 short lines per chunk).
    chunks: List[str] = []
    buffer: List[str] = []
    for s in simplified:
        line = s
        if line and line[-1] not in ".!?":
            line = f"{line}."
        buffer.append(line)
        if len(buffer) >= 2:
            chunks.append(" ".join(buffer).strip())
            buffer = []
    if buffer:
        chunks.append(" ".join(buffer).strip())

    # Keep interaction frequent for kids.
    interactive_lines = []
    for i, chunk in enumerate(chunks):
        interactive_lines.append(chunk)
        if (i + 1) % 3 == 0 and "?" not in chunk:
            interactive_lines.append("What do you think so far?")

    result = "\n\n".join(interactive_lines).strip()
    if not re.search(r"(great job|well done|you are doing great|nice work)", result, flags=re.IGNORECASE):
        result = f"{result}\n\nGreat job. You are doing great."
    return result


# -------------------------
# NODES
# -------------------------

def ensure_unit_plan(state: LessonState):
    # Initialize default values
    if "teacher_text" not in state:
        state["teacher_text"] = ""
    if "quiz" not in state:
        state["quiz"] = {}
    
    # Use current_unit's unit_id if available, otherwise use chapter_id
    current_unit = state.get("current_unit", {})
    unit_id = current_unit.get("real_unit_id") or current_unit.get("unit_id") or state["chapter_id"]
    
    print(f"[DEBUG] ensure_unit_plan: chapter_id={state['chapter_id']}, unit_id={unit_id}, current_unit={current_unit}")
    
    # If unit_id is short like "unit_01", construct full ID from chapter_id
    if unit_id and ":" not in unit_id and "unit_" in unit_id and state["chapter_id"]:
        if ":" in state["chapter_id"]:
            book_part = state["chapter_id"].split(":")[0]
            unit_id = f"{book_part}:{unit_id}"
        else:
            # chapter_id is like "english_g6", so use it as prefix
            unit_id = f"{state['chapter_id']}:{unit_id}"
    
    # ALWAYS use unit_id for the plan key to ensure each unit has its own plan
    # This prevents different units from sharing the same cached plan
    if unit_id and unit_id != state["chapter_id"]:
        plan_key = unit_id  # Use specific unit_id
    else:
        plan_key = state["chapter_id"]  # Only use chapter_id if we don't have a specific unit
    
    print(f"[DEBUG] ensure_unit_plan: Using plan_key={plan_key} for unit_id={unit_id}")
    
    plan = load_unit_plan(state["student_id"], plan_key)
    if plan:
        print(f"[DEBUG] ensure_unit_plan: Loaded existing plan for {plan_key}")
        state["unit_plan"] = plan
        return state

    # Build plan from book - use unit_id for retrieval if available
    # IMPORTANT: Always use the specific unit_id, never fallback to chapter_id
    # This ensures each unit gets its own unique content
    retrieve_id = unit_id if unit_id != state["chapter_id"] else state["chapter_id"]
    chunks = retrieve_for_item(
        retrieve_id,
        "reading vocabulary grammar listening speaking writing wrap up",
        k=12
    )
    
    # Only fallback to chapter_id if we don't have a specific unit_id
    # This prevents different units from getting the same content
    if (not chunks or len(chunks) == 0) and retrieve_id == state["chapter_id"]:
        # Only if we're already using chapter_id, we can't do better
        pass
    elif (not chunks or len(chunks) == 0) and retrieve_id != state["chapter_id"]:
        # If we have a specific unit_id but no chunks, try a broader search
        # but still within the unit context - don't use generic chapter_id
        print(f"[WARNING] No chunks found for unit {retrieve_id}, but keeping unit-specific context")
    
    if not chunks or len(chunks) == 0:
        # If still no chunks found, create a minimal plan with a single item
        # This allows the teaching to proceed even if plan generation fails
        print(f"[DEBUG] No chunks found for {retrieve_id}, creating minimal plan")
        unit_title = current_unit.get("title") or "Unit Content"
        state["unit_plan"] = {
            "unit_title": unit_title,
            "items": [{
                "id": "content",
                "type": "other",
                "title": unit_title,
                "must_cover": True,
                "keywords": current_unit.get("keywords", [])
            }]
        }
        print(f"[DEBUG] Created minimal plan with {len(state['unit_plan']['items'])} items")
        return state
    
    context = "\n\n".join(c["text"] for c in chunks)

    msg = llm.invoke([ 
        {"role": "system", "content": UNIT_PLAN_PROMPT},
        {"role": "user", "content": f"Unit text:\n{context}"}
    ])

    plan = json_safe(msg.content)
    print(f"[DEBUG] ensure_unit_plan: Saving new plan for {plan_key} with {len(plan.get('items', []))} items")
    save_unit_plan(state["student_id"], plan_key, plan)
    state["unit_plan"] = plan
    return state


def load_progress_node(state: LessonState):
    state["progress"] = load_unit_progress(
        state["student_id"], state["chapter_id"]
    )
    
    # Initialize hint_count if not present
    if "hint_count" not in state["progress"]:
        state["progress"]["hint_count"] = 0
    
    # Check if unit_plan exists and has items
    if "unit_plan" not in state or not state.get("unit_plan"):
        print(f"[DEBUG] load_progress_node: No unit_plan found, setting done=True")
        state["done"] = True
        state["teacher_text"] = ""
        state["quiz"] = {}
        state["hint_count"] = 0
        return state
    
    items = state["unit_plan"].get("items", [])
    print(f"[DEBUG] load_progress_node: Found {len(items)} items in unit_plan")
    if not items or len(items) == 0:
        print(f"[DEBUG] load_progress_node: Items list is empty, setting done=True")
        state["done"] = True
        state["teacher_text"] = ""
        state["quiz"] = {}
        state["hint_count"] = 0
        return state
    
    idx = state["progress"]["current_item_index"]

    if idx >= len(items):
        state["done"] = True
        state["teacher_text"] = ""
        state["quiz"] = {}
        state["hint_count"] = 0
        return state

    state["current_item"] = items[idx]
    state["done"] = False
    state["hint_count"] = state["progress"].get("hint_count", 0)
    print(f"[DEBUG] load_progress_node: Selected item {idx}: {items[idx].get('title', items[idx].get('id', 'unknown'))}")
    return state


def teach_item(state: LessonState):
    # Check if current_item exists
    if "current_item" not in state or not state.get("current_item"):
        state["done"] = True
        state["teacher_text"] = "Error: No current item to teach. Please check the unit plan."
        return state
    
    item = state["current_item"]
    item_type = item.get("type", "")
    item_id = item.get("id", "")
    base_query = " ".join(item.get("keywords", [])) or item.get("title", "")

    # Use unit_id from current_unit if available, otherwise use chapter_id
    current_unit = state.get("current_unit", {})
    unit_id = current_unit.get("real_unit_id") or current_unit.get("unit_id") or state["chapter_id"]
    unit_part = current_unit.get("unit_part", 0)  # 0 = first half, 1 = second half
    unit_pages = current_unit.get("unit_pages", {})
    unit_title = current_unit.get("title") or state.get("unit_plan", {}).get("unit_title", "")
    
    # Enhance query based on item type to retrieve specific content
    if item_type == "visual" or item_id == "visual_elements":
        # Search specifically for visual content: pictures, illustrations, diagrams, charts, images
        query = f"{base_query} picture illustration diagram chart image visual drawing photo figure"
    elif item_type == "discussion" or item_id == "discussion_questions":
        # Search for discussion questions, class activities, "discuss with the class"
        query = f"{base_query} discuss discussion question class activity talk about share"
    elif item_type == "exercises" or item_id == "exercises":
        # Search for exercises, practice tasks, fill-in-the-blank, workbook activities
        query = f"{base_query} exercise practice task fill blank write complete workbook activity"
    elif item_id == "unit_opening":
        # Search for unit opening, introduction, title page, overview
        query = f"{base_query} opening introduction title page overview unit start beginning"
    else:
        # For other types, use base query
        query = base_query
    
    # Enhance query with unit title to help retrieve relevant content
    if unit_title and unit_title not in query:
        query = f"{unit_title} {query}".strip()
    
    # Add page context to query to help retrieve different content for part 1 vs part 2
    if unit_part == 0:
        query = f"{query} beginning start first pages introduction opening".strip()
    elif unit_part == 1:
        query = f"{query} later pages continuation second part exercises practice activities".strip()
    
    # If unit_id is short like "unit_01", construct full ID from chapter_id
    if unit_id and ":" not in unit_id and "unit_" in unit_id and state["chapter_id"]:
        if ":" in state["chapter_id"]:
            book_part = state["chapter_id"].split(":")[0]
            unit_id = f"{book_part}:{unit_id}"
        else:
            # chapter_id is like "english_g6", so use it as prefix
            unit_id = f"{state['chapter_id']}:{unit_id}"
    
    print(f"[DEBUG] teach_item: Using unit_id={unit_id} for teaching (chapter_id={state['chapter_id']})")
    
    # Calculate page range for this part (first half = pages 1-5, second half = pages 6-10)
    start_page = unit_pages.get("start_page", 0) if unit_pages else 0
    end_page = unit_pages.get("end_page", 0) if unit_pages else 0
    
    # If pages are invalid, use default (assume 10 pages starting from 1)
    if start_page == 0 and end_page == 0:
        start_page = 1
        end_page = 10
    
    total_pages = end_page - start_page + 1
    if total_pages < 2:
        total_pages = 10  # Default to 10 pages if calculation is wrong
    
    if unit_part == 0:
        # First half: pages 1-5 (relative to unit start)
        part_start = start_page
        part_end = start_page + (total_pages // 2) - 1
        pages_desc = f"pages {part_start} to {part_end} (first half)"
    else:
        # Second half: pages 6-10 (relative to unit start)
        part_start = start_page + (total_pages // 2)
        part_end = end_page
        pages_desc = f"pages {part_start} to {part_end} (second half)"
    
    # Retrieve chunks (20 chunks for half a unit instead of 40 for full)
    # IMPORTANT: Always use the specific unit_id to ensure each unit gets unique content
    print(f"[DEBUG] teach_item: Retrieving chunks for unit_id={unit_id}, unit_title='{unit_title}', item_type={item_type}, query={query[:100]}...")
    chunks = retrieve_for_item(unit_id, query, k=20, unit_part=unit_part, unit_pages=unit_pages)
    print(f"[DEBUG] teach_item: Retrieved {len(chunks)} chunks with unit_part filter for unit {unit_id}")
    
    # If no chunks found, try retrieving without unit_part filter (but still for this unit)
    if not chunks or len(chunks) == 0:
        print(f"[DEBUG] teach_item: No chunks with filter, trying without unit_part filter for unit {unit_id}")
        chunks = retrieve_for_item(unit_id, query, k=20, unit_part=None, unit_pages=None)
        print(f"[DEBUG] teach_item: Retrieved {len(chunks)} chunks without filter for unit {unit_id}")
    
    # For specific item types, also retrieve broader context to ensure we get all relevant content
    # This helps find visual elements, exercises, and discussion questions that might be in adjacent chunks
    if item_type in ["visual", "discussion", "exercises"] or item_id in ["visual_elements", "discussion_questions", "exercises"]:
        # Get additional chunks with a broader query to catch related content
        broader_query = f"{unit_title} {base_query}" if unit_title and base_query else (unit_title or base_query)
        additional_chunks = retrieve_for_item(unit_id, broader_query, k=10, unit_part=unit_part, unit_pages=unit_pages)
        # Merge chunks, avoiding duplicates (by text content)
        existing_texts = {c["text"][:100] for c in chunks}  # Use first 100 chars as key
        for chunk in additional_chunks:
            if chunk["text"][:100] not in existing_texts:
                chunks.append(chunk)
                existing_texts.add(chunk["text"][:100])
        # CRITICAL: Re-sort by page number after merging to maintain sequential order
        chunks.sort(key=lambda c: c["meta"].get("pdf_page", 0))
        print(f"[DEBUG] teach_item: After adding broader context, total chunks: {len(chunks)}")
    
    # DO NOT fallback to chapter_id - this causes all units to get the same content
    # If no chunks found for this specific unit, that's an error, not a reason to use generic content
    
    state["retrieved_chunks"] = chunks
    state["unit_part"] = unit_part
    state["pages_desc"] = pages_desc

    if not chunks or len(chunks) == 0:
        state["teacher_text"] = f"Error: No content found for unit {unit_id}. Please check if the unit exists in the database."
        state["quiz"] = {}
        return state

    # Build context with page order indicator
    context_parts = []
    for i, chunk in enumerate(chunks):
        page_num = chunk["meta"].get("pdf_page", "?")
        context_parts.append(f"[Content from page {page_num}]\n{chunk['text']}")
    context = "\n\n".join(context_parts)
    
    # Add instruction to follow order
    context = f"""IMPORTANT: The content below is provided in the EXACT order it appears in the book (sorted by page number). 
You MUST teach in this EXACT order - do NOT reorganize or jump between sections.
Follow the sequence: first section first, second section second, etc.

{context}"""
    
    # Debug: Log what chunks we retrieved (first 200 chars of each)
    print(f"[DEBUG] teach_item: Unit title = '{unit_title}'")
    print(f"[DEBUG] teach_item: Retrieved {len(chunks)} chunks in page order")
    if chunks:
        print(f"[DEBUG] teach_item: First chunk preview: {chunks[0]['text'][:200]}...")
        # Check if chunks seem to match the unit title
        first_chunk_text = chunks[0]['text'].lower()
        unit_title_lower = unit_title.lower() if unit_title else ""
        if unit_title_lower and unit_title_lower not in first_chunk_text:
            print(f"[WARNING] teach_item: First chunk doesn't seem to contain unit title keywords. Chunk may be about different topic.")
    
    # Don't mention page ranges to the LLM - let it teach naturally
    # The context already contains only the relevant pages, so the LLM will naturally focus on them
    # CRITICAL: Put unit title FIRST and make it very prominent
    if unit_title:
        user_content = f"""═══════════════════════════════════════════════════════════════════════════════
UNIT TITLE (THIS IS WHAT YOU MUST TEACH ABOUT):
{unit_title}
═══════════════════════════════════════════════════════════════════════════════

SESSION PACING: This lesson is **one of {SESSION_HALVES_PER_UNIT} parts** for this unit (~{SESSION_UNIT_MINUTES} minutes for **this** part only). Book excerpts below are for **this half** of the unit—teach that scope deeply; do not compress the whole unit into one lesson.

⚠️ YOUR TEACHING MUST BE ABOUT THE TOPIC ABOVE: "{unit_title}"
⚠️ DO NOT teach about other topics even if they appear in the context below.
⚠️ DO NOT use a different unit title in your response.

Item to teach:
{item}

Context from book:
{context}

═══════════════════════════════════════════════════════════════════════════════
REMINDER: The Unit Title is "{unit_title}". Your entire lesson must be about this topic.
If the context contains content about other topics, IGNORE those parts and focus ONLY on content related to "{unit_title}".
═══════════════════════════════════════════════════════════════════════════════"""
    else:
        user_content = (
            f"SESSION PACING: One of {SESSION_HALVES_PER_UNIT} parts for this unit "
            f"(~{SESSION_UNIT_MINUTES} minutes this part only). Teach only the half reflected in the excerpts.\n\n"
            f"Item to teach:\n{item}\n\nContext from book:\n{context}"
        )
    
    try:
        generated_text = _generate_guided_teacher_text(
            context=context,
            unit_title=unit_title or "",
        )
        if not generated_text:
            # Fallback to legacy prompt if new pipeline returns empty.
            msg = llm.invoke([
                {"role": "system", "content": TEACH_ITEM_PROMPT},
                {"role": "user", "content": user_content}
            ])
            generated_text = msg.content if msg and msg.content else "Error: LLM returned empty response."
        
        # Validation: Check if generated text mentions wrong unit titles
        if unit_title:
            generated_lower = generated_text.lower()
            unit_title_lower = unit_title.lower()
            
            # Common wrong unit titles to check for
            wrong_titles = [
                "why do we build bridges and tunnels",
                "why we build bridges and tunnels",
                "bridges and tunnels",
                "the earthworm and the spider",
                "earthworm and spider"
            ]
            
            # Check if generated text contains wrong titles (but not if it's the correct one)
            for wrong_title in wrong_titles:
                if wrong_title in generated_lower and wrong_title not in unit_title_lower:
                    print(f"[WARNING] Generated text may contain wrong unit title '{wrong_title}' when expected '{unit_title}'")
                    # Check if the wrong title appears as a main heading
                    if f"**{wrong_title}" in generated_lower or f"# {wrong_title}" in generated_lower:
                        print(f"[ERROR] Generated text starts with wrong unit title! Regenerating...")
                        # Try once more with even stronger emphasis
                        user_content_retry = f"""═══════════════════════════════════════════════════════════════════════════════
⚠️⚠️⚠️ CRITICAL ERROR DETECTED ⚠️⚠️⚠️

You previously generated content with the WRONG unit title. 

THE CORRECT UNIT TITLE IS: "{unit_title}"

DO NOT use any other unit title. DO NOT mention "Why do we build bridges and tunnels" or "The Earthworm and the Spider" unless the Unit Title is exactly that.

═══════════════════════════════════════════════════════════════════════════════
UNIT TITLE (THIS IS WHAT YOU MUST TEACH ABOUT):
{unit_title}
═══════════════════════════════════════════════════════════════════════════════

SESSION PACING: This lesson is **one of {SESSION_HALVES_PER_UNIT} parts** for this unit (~{SESSION_UNIT_MINUTES} minutes for **this** part only). Book excerpts below are for **this half** of the unit.

Item to teach:
{item}

Context from book:
{context}

═══════════════════════════════════════════════════════════════════════════════
REMINDER: The Unit Title is "{unit_title}". Your entire lesson must be about this topic.
═══════════════════════════════════════════════════════════════════════════════"""
                        msg_retry = llm.invoke([
                            {"role": "system", "content": TEACH_ITEM_PROMPT},
                            {"role": "user", "content": user_content_retry}
                        ])
                        generated_text = msg_retry.content if msg_retry and msg_retry.content else generated_text
        
        state["teacher_text"] = _enforce_kid_friendly_delivery(generated_text)
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to generate teacher_text: {e}")
        traceback.print_exc()
        state["teacher_text"] = f"Error generating lesson content: {str(e)}"
    
    return state


def coverage_guard(state: LessonState):
    # Check if current_item exists
    if "current_item" not in state or not state.get("current_item"):
        return state
    
    item = state["current_item"]
    context = "\n\n".join(c["text"] for c in state.get("retrieved_chunks", []))

    msg = llm.invoke([
        {"role": "system", "content": COVERAGE_GUARD_PROMPT},
        {"role": "user", "content": f"""
Item:
{item}

Teacher explanation:
{state["teacher_text"]}

Book context:
{context}
"""}
    ])

    result = json_safe(msg.content)
    tutor_quality = state.get("tutor_quality") or {}
    if not isinstance(tutor_quality, dict):
        tutor_quality = {}
    tutor_quality["coverage_guard_called"] = True
    tutor_quality["coverage_missing"] = result.get("missing", [])
    tutor_quality["coverage_fix_applied"] = (not result.get("covered", True))
    tutor_quality["teacher_text_len"] = len(state.get("teacher_text", "") or "")
    # Simple policy checks (no extra LLM calls)
    teacher_text_lower = (state.get("teacher_text", "") or "").lower()
    tutor_quality["mentions_page_ranges"] = ("pages 1-5" in teacher_text_lower) or ("pages 6-10" in teacher_text_lower)
    state["tutor_quality"] = tutor_quality
    if not result["covered"]:
        # regenerate teaching with fix instructions
        fix_msg = llm.invoke([
            {"role": "system", "content": TEACH_ITEM_PROMPT},
            {"role": "user", "content": f"""
Item:
{item}

Fix instructions:
{result["fix_instructions"]}

Context:
{context}
"""}
        ])
        state["teacher_text"] = _enforce_kid_friendly_delivery(fix_msg.content)

    return state


def make_quiz(state: LessonState):
    # If we were given a quiz (e.g. /session/answer), reuse it so we grade the same question.
    provided = state.get("provided_quiz")
    if provided:
        state["quiz"] = provided
        return state

    # NEW quiz being generated - reset hint_count to 0 for this new quiz
    p = state["progress"]
    p["hint_count"] = 0
    state["hint_count"] = 0
    save_unit_progress(state["student_id"], state["chapter_id"], p)

    # Check if teacher_text exists and is not empty
    teacher_text = state.get("teacher_text", "")
    if not teacher_text or teacher_text.strip() == "":
        state["quiz"] = {"question": "No quiz available - teaching content was not generated.", "expected_points": []}
        return state

    try:
        msg = llm.invoke([
            {"role": "system", "content": QUIZ_PROMPT},
            {"role": "user", "content": teacher_text}
        ])
        if msg and msg.content:
            state["quiz"] = json_safe(msg.content)
        else:
            state["quiz"] = {"question": "Please summarize what you learned from this lesson.", "expected_points": ["Understanding of the main concepts"]}
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to generate quiz: {e}")
        traceback.print_exc()
        # Fallback quiz if generation fails
        state["quiz"] = {"question": "Please summarize what you learned from this lesson.", "expected_points": ["Understanding of the main concepts"]}
    
    return state


def evaluate_answer(state: LessonState):
    msg = llm.invoke([
        {"role": "system", "content": EVAL_PROMPT},
        {"role": "user", "content": f"""
Quiz:
{state["quiz"]}

Student answer:
{state.get("student_answer", "")}
"""}
    ])
    state["evaluation"] = json_safe(msg.content)
    p = state["progress"]
    attempt = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "item_id": (state.get("current_item") or {}).get("id"),
        "quiz_question": (state.get("quiz") or {}).get("question"),
        "correct": bool(state["evaluation"].get("correct", False)),
        "hint_count_before": int(p.get("hint_count", 0) or 0),
        "hint_count_after": int(p.get("hint_count", 0) or 0),
        "remediation_used": False,
    }
    # Identify unit_id consistently
    current_unit = state.get("current_unit", {}) if isinstance(state.get("current_unit", {}), dict) else {}
    unit_id = str(current_unit.get("real_unit_id") or current_unit.get("unit_id") or state.get("chapter_id") or "")
    unit_part = int(current_unit.get("unit_part", 0) or 0)

    if state["evaluation"]["correct"]:
        # mark item done
        if "current_item" in state and state["current_item"]:
            p["done_items"].append(state["current_item"].get("id", ""))
        p["current_item_index"] += 1
        p["last_quiz"] = None
        p["hint_count"] = 0  # Reset hint count on correct answer
        attempt["hint_count_after"] = 0
        hist = p.get("attempt_history", [])
        if not isinstance(hist, list):
            hist = []
        hist.append(attempt)
        p["attempt_history"] = hist[-200:]
        save_unit_progress(state["student_id"], state["chapter_id"], p)

        adv = llm.invoke([
            {"role": "system", "content": ADVANCE_PROMPT},
            {"role": "user", "content": state["teacher_text"]}
        ])
        state["advance_text"] = adv.content
        state["hint_text"] = ""
        state["remediation_text"] = ""
        state["hint_count"] = 0
    else:
        # Get current hint count from progress (default to 0)
        hint_count = p.get("hint_count", 0)
        
        if hint_count < 2:
            # Provide hint (1st or 2nd attempt)
            hint_number = hint_count + 1
            hint = llm.invoke([
                {"role": "system", "content": HINT_PROMPT.format(hint_number=hint_number)},
                {"role": "user", "content": f"""
Teacher explanation:
{state["teacher_text"]}

Quiz question:
{state["quiz"].get("question", "")}

Student's incorrect answer:
{state.get("student_answer", "")}

This is hint number {hint_number} of 2.
"""}
            ])
            state["hint_text"] = hint.content
            state["remediation_text"] = ""  # No remediation yet
            state["hint_count"] = hint_number
            
            # Update progress with new hint count
            p["hint_count"] = hint_number
            attempt["hint_count_after"] = hint_number
            hist = p.get("attempt_history", [])
            if not isinstance(hist, list):
                hist = []
            hist.append(attempt)
            p["attempt_history"] = hist[-200:]
            save_unit_progress(state["student_id"], state["chapter_id"], p)
        else:
            # 3rd incorrect answer - provide full remediation
            rem = llm.invoke([
                {"role": "system", "content": REMEDIAL_PROMPT},
                {"role": "user", "content": f"""
Teacher explanation:
{state["teacher_text"]}

Quiz question:
{state["quiz"].get("question", "")}

Student's incorrect answer (3rd attempt):
{state.get("student_answer", "")}

The student has already received 2 hints. Now provide a comprehensive re-explanation.
"""}
            ])
            state["hint_text"] = ""  # No more hints
            state["remediation_text"] = rem.content
            state["hint_count"] = 2  # Keep at 2 (max)
            
            # Reset hint count for next question
            p["hint_count"] = 0
            attempt["hint_count_after"] = 0
            attempt["remediation_used"] = True
            hist = p.get("attempt_history", [])
            if not isinstance(hist, list):
                hist = []
            hist.append(attempt)
            p["attempt_history"] = hist[-200:]
            save_unit_progress(state["student_id"], state["chapter_id"], p)

        # Keep the same quiz for retry (don't generate new one)
        # The quiz stays the same until they get it correct

    # Persist evaluation attempt + tutor quality signals
    tutor_quality_signals = state.get("tutor_quality") if isinstance(state.get("tutor_quality"), dict) else None
    record_quiz_attempt(
        student_id=state["student_id"],
        unit_id=unit_id,
        item_id=attempt.get("item_id"),
        quiz_question=attempt.get("quiz_question"),
        correct=bool(attempt.get("correct", False)),
        hint_count_before=int(attempt.get("hint_count_before", 0) or 0),
        hint_count_after=int(attempt.get("hint_count_after", 0) or 0),
        remediation_used=bool(attempt.get("remediation_used", False)),
        tutor_quality_signals=tutor_quality_signals,
    )
    summary = eval_summary(state["student_id"])
    state["evaluation_summary"] = summary
    state["recommendations"] = build_recommendations(
        latest_attempt={
            "correct": bool(attempt.get("correct", False)),
            "hint_count_after": int(attempt.get("hint_count_after", 0) or 0),
            "remediation_used": bool(attempt.get("remediation_used", False)),
        },
        evaluation_summary=summary,
        unit_part=unit_part,
    )

    return state


# -------------------------
# GRAPH
# -------------------------

def build_graph():
    g = StateGraph(LessonState)

    g.add_node("plan", ensure_unit_plan)
    g.add_node("load_progress", load_progress_node)
    g.add_node("teach", teach_item)
    g.add_node("guard", coverage_guard)
    g.add_node("quiz", make_quiz)
    g.add_node("eval", evaluate_answer)

    g.set_entry_point("plan")
    g.add_edge("plan", "load_progress")
    
    # Check if done after loading progress
    def _route_after_load_progress(state: LessonState):
        if state.get("done", False):
            return END
        return "teach"
    
    g.add_conditional_edges("load_progress", _route_after_load_progress, {"teach": "teach", END: END})
    g.add_edge("teach", "guard")
    g.add_edge("guard", "quiz")

    # If there's a student answer, evaluate; otherwise stop after producing the quiz.
    def _route_after_quiz(state: LessonState):
        ans = (state.get("student_answer") or "").strip()
        return "eval" if ans else END

    g.add_conditional_edges("quiz", _route_after_quiz, {"eval": "eval", END: END})
    g.add_edge("eval", END)

    return g.compile()


lesson_graph = build_graph()


# -------------------------
# SAFE JSON PARSER
# -------------------------

import json

def json_safe(text: str):
    """
    Parse JSON from common LLM outputs.

    Supports:
    - raw JSON
    - fenced JSON blocks (```json ... ```)
    - JSON embedded in extra text (extracts outermost {...})
    """
    if text is None:
        raise ValueError("LLM returned empty content (None)")

    s = str(text).strip()

    # Strip Markdown code fences if present.
    if s.startswith("```") and "```" in s[3:]:
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()

    # First try direct parse.
    try:
        return json.loads(s)
    except Exception:
        pass

    # Fallback: extract the largest JSON object from the text.
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(s[start:end + 1])
        except Exception:
            pass

    raise ValueError(f"LLM did not return valid JSON. Got: {s[:200]!r}")


def retrieve_for_chapter(chapter_id: str, query: str, k: int = 8):
    client = get_chroma_client("chroma_db")
    col = get_collection(client, "pdf_chunks")

    qv = embedder.embed_query(query)
    res = col.query(
        query_embeddings=[qv],
        n_results=k,
        where={"unit_id": chapter_id},
    )

    chunks = []
    for i in range(len(res["documents"][0])):
        chunks.append({
            "text": res["documents"][0][i],
            "meta": res["metadatas"][0][i],
        })
    return chunks
