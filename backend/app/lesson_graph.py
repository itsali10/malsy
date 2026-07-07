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
    HISTORY_TEACHER_PROMPT,
    COVERAGE_GUARD_PROMPT,
    QUIZ_PROMPT,
    MCQ_QUIZ_PROMPT,
    MCQ_QUIZ_BANK_PROMPT,
    ENGLISH_MCQ_QUIZ_PROMPT,
    ENGLISH_MCQ_QUIZ_BANK_PROMPT,
    SPEAKING_TASK_PROMPT,
    EVAL_PROMPT,
    HINT_PROMPT,
    REMEDIAL_PROMPT,
    ADVANCE_PROMPT,
)
from .listening_generator import (
    collect_vocabulary_keywords,
    ensure_listening_activity,
    extract_curriculum_listening_questions,
    format_listening_teacher_text,
    gather_book_context,
    listening_question_to_quiz,
)
from .listening_store import load_listening
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

from .lesson_content_mapping import LESSON_EXTRACTION_FAILED_MESSAGE

INSUFFICIENT_TEXTBOOK_MESSAGE = LESSON_EXTRACTION_FAILED_MESSAGE


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
    option_index: Optional[int]
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
    listening: Optional[Dict[str, Any]]
    listening_more_questions: bool
    lesson_more_questions: bool
    listening_phase: bool


LESSON_MCQ_COUNT = 3


# -------------------------
# HELPERS
# -------------------------

def _is_history_chapter(chapter_id: str) -> bool:
    return "history" in (chapter_id or "").lower()


def _unit_id_from_state(state: LessonState) -> str:
    current_unit = state.get("current_unit") if isinstance(state.get("current_unit"), dict) else {}
    raw = current_unit.get("real_unit_id") or current_unit.get("unit_id") or state.get("chapter_id") or ""
    unit_id = str(raw)
    if unit_id and ":" not in unit_id and "unit_" in unit_id and state.get("chapter_id"):
        chapter_id = str(state["chapter_id"])
        if ":" in chapter_id:
            unit_id = f"{chapter_id.split(':')[0]}:{unit_id}"
        else:
            unit_id = f"{chapter_id}:{unit_id}"
    return unit_id


def _build_lesson_content_for_listening(state: LessonState, book_context: str = "") -> str:
    unit_plan = state.get("unit_plan") if isinstance(state.get("unit_plan"), dict) else {}
    unit_title = unit_plan.get("unit_title") or ""
    vocab = collect_vocabulary_keywords(unit_plan)
    teacher = (state.get("teacher_text") or "").strip()
    parts: List[str] = []
    if unit_title:
        parts.append(f"Unit: {unit_title}")
    if vocab:
        parts.append("Vocabulary: " + ", ".join(vocab))
    if book_context.strip():
        parts.append(book_context.strip())
    if teacher:
        parts.append(teacher)
    return "\n\n".join(parts) if parts else book_context


def _generate_listening_for_state(
    state: LessonState,
    *,
    lesson_content: str,
    book_context: str = "",
    curriculum_questions: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    unit_id = _unit_id_from_state(state)
    unit_plan = state.get("unit_plan") if isinstance(state.get("unit_plan"), dict) else {}
    current_unit = state.get("current_unit") if isinstance(state.get("current_unit"), dict) else {}
    unit_title = (
        current_unit.get("title")
        or unit_plan.get("unit_title")
        or unit_id
    )
    try:
        return ensure_listening_activity(
            unit_id,
            lesson_content=lesson_content,
            book_context=book_context,
            unit_title=str(unit_title),
            vocabulary=collect_vocabulary_keywords(unit_plan),
            curriculum_questions=curriculum_questions,
            grade=6,
        )
    except Exception as exc:
        print(f"[listening] generation failed for {unit_id}: {exc}")
        return None


def _safe_prompt(template: str, **kwargs: str) -> str:
    """Fill {placeholders} without breaking JSON braces in prompt templates."""
    out = template
    for key, val in kwargs.items():
        out = out.replace("{" + key + "}", val)
    return out


def retrieve_for_item(unit_id: str, query: str, k: int = 8, unit_part: Optional[int] = None, unit_pages: Optional[Dict[str, Any]] = None):
    """
    Retrieve chunks for a unit, optionally filtered by page range.
    
    Args:
        unit_id: Full unit ID (e.g., "english_g6:unit_01")
        query: Search query
        k: Number of chunks to retrieve
        unit_part: 0 = first half of lesson pages, 1 = second half, None = all pages
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
            from .language_lesson_sections import chunk_pdf_page, part_page_range

            start_page = int(unit_pages.get("start_page") or 0)
            end_page = int(unit_pages.get("end_page") or 0)
            if start_page > 0 and end_page >= start_page:
                part_start, part_end = part_page_range(start_page, end_page, int(unit_part))
                pdf_page = chunk_pdf_page({"meta": chunk_meta, "text": chunk_text})
                if pdf_page is not None:
                    if pdf_page < part_start or pdf_page > part_end:
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


def retrieve_all_chunks_for_unit(
    unit_id: str,
    *,
    unit_part: Optional[int] = None,
    unit_pages: Optional[Dict[str, Any]] = None,
    max_chunks: int = 30,
) -> List[Dict[str, Any]]:
    """Load all ingested chunks for a lesson unit (metadata filter), sorted by page."""
    client = get_chroma_client("chroma_db")
    col = get_collection(client, "pdf_chunks")
    try:
        res = col.get(where={"unit_id": unit_id}, include=["documents", "metadatas"])
    except Exception as exc:
        print(f"[lesson-retrieval] unit metadata get failed for {unit_id}: {exc}")
        return []

    ids = res.get("ids") or []
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    chunks: List[Dict[str, Any]] = []
    for i, doc in enumerate(docs):
        if not doc or not str(doc).strip():
            continue
        meta = dict(metas[i] if i < len(metas) and metas[i] else {})
        meta["chunk_id"] = ids[i] if i < len(ids) else meta.get("chunk_id")
        chunks.append({"text": doc, "meta": meta})

    chunks.sort(key=lambda c: int(c["meta"].get("pdf_page") or 0))
    chunks = _apply_page_part_filter(chunks, unit_part, unit_pages)
    return chunks[:max_chunks]


def _log_lesson_retrieval(*, lesson_id: str, chunks: List[Dict[str, Any]], source: str) -> None:
    text_len = sum(len(str(c.get("text") or "")) for c in chunks)
    chunk_ids = [
        str((c.get("meta") or {}).get("chunk_id") or (c.get("meta") or {}).get("pdf_page") or "?")
        for c in chunks
    ]
    print(f"[lesson-retrieval] lesson_id={lesson_id}")
    print(f"[lesson-retrieval] source={source} chunk_count={len(chunks)} text_len={text_len}")
    print(f"[lesson-retrieval] chunk_ids={chunk_ids[:25]}")
    if chunks:
        preview = str(chunks[0].get("text") or "")[:200].replace("\n", " ")
        print(f"[lesson-retrieval] first_chunk_preview={preview!r}")


def _retrieve_lesson_chunks(
    unit_id: str,
    query: str,
    *,
    book_id: str = "",
    plan_unit: Optional[Dict[str, Any]] = None,
    unit_part: Optional[int] = None,
    unit_pages: Optional[Dict[str, Any]] = None,
    k: int = 20,
) -> tuple[List[Dict[str, Any]], str, Dict[str, Any]]:
    """Mapping-first retrieval: stored chunk ids → unit metadata → page range → semantic."""
    from .lesson_content_mapping import retrieve_chunks_for_lesson

    chunks, source, mapping = retrieve_chunks_for_lesson(
        unit_id,
        query,
        book_id=book_id or (unit_id.split(":")[0] if ":" in unit_id else ""),
        plan_unit=plan_unit,
        unit_part=unit_part,
        unit_pages=unit_pages,
        k=k,
    )
    return chunks, source, mapping


def _format_textbook_context(chunks: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for chunk in chunks:
        meta = chunk.get("meta") or {}
        page_num = meta.get("pdf_page", "?")
        chunk_id = meta.get("chunk_id") or f"p{page_num}"
        parts.append(f"[Excerpt id={chunk_id}, page={page_num}]\n{chunk['text']}")
    return "\n\n".join(parts)


_GENERIC_OPENER_RE = re.compile(
    r"(?is)^\s*(?:"
    r"hey there!?|hi there!?|hello!?|"
    r"today (?:we(?:'| a)?re going to|we will) (?:learn|dive|explore)|"
    r"science is all about"
    r")"
)
_CANNED_DEMO_PHRASES = (
    "baking soda",
    "vinegar",
    "mixing baking soda",
)


def _looks_like_generic_lesson(text: str, textbook_context: str) -> bool:
    """Detect AI filler that is not supported by retrieved textbook excerpts."""
    raw = str(text or "").strip()
    if not raw:
        return False
    if _GENERIC_OPENER_RE.match(raw):
        return True
    ctx_lower = str(textbook_context or "").lower()
    lower = raw.lower()
    for phrase in _CANNED_DEMO_PHRASES:
        if phrase in lower and phrase not in ctx_lower:
            return True
    return False


def _build_textbook_teaching_prompt(
    *,
    unit_title: str,
    item: Dict[str, Any],
    context: str,
    unit_part: int,
    history_scope: str = "",
) -> str:
    part_label = "first" if int(unit_part) == 0 else "second"
    header = f"""RETRIEVED TEXTBOOK EXCERPTS (YOUR ONLY SOURCE — teach in this exact order):
{context}

---
Lesson topic: {unit_title or "this lesson"}
Session: {part_label} half of this lesson (~{SESSION_UNIT_MINUTES} minutes this part).

Teaching focus:
{item}

{history_scope}

INSTRUCTIONS:
- Your FIRST sentence must teach the opening concept from the excerpts above.
- Do NOT start with a greeting, "Hey there!", or "Today we're going to learn...".
- Every fact and example must come from the excerpts. Do not invent generic demos.
- Simplify for an 11-12 year old, but stay faithful to the book.
- Skip workbook question lists; teach the ideas instead."""
    return header.strip()


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
        _safe_prompt(LESSON_ANALYSIS_PROMPT, book_text=context),
    )

    steps = ["intro", "explain", "example", "question", "summary"]
    turns: List[str] = []
    for step in steps:
        turn_obj = _invoke_json(
            MASTER_SYSTEM_PROMPT,
            _safe_prompt(
                TURN_GENERATOR_PROMPT,
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
            _safe_prompt(
                VALIDATION_PROMPT,
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
        title_line = f"Let's explore {unit_title} together."
        if not turns:
            turns = [title_line]
        elif not turns[0].lower().startswith("let's"):
            turns.insert(0, title_line)

    # Keep result concise and speech-friendly.
    return "\n\n".join(turns[:8]).strip()


_HISTORY_DISCUSSION_BLOCK = re.compile(
    r"(?im)^\s*(?:discussion questions?|comprehension questions?|class activities?|"
    r"your turn|activities?|think and discuss|exercises?|worksheet)\b.*$"
)


def _strip_history_workbook_content(text: str) -> str:
    """Remove printed question/activity blocks from textbook excerpts."""
    if not text:
        return text
    lines = text.split("\n")
    out: List[str] = []
    skipping = False
    for line in lines:
        stripped = line.strip()
        if _HISTORY_DISCUSSION_BLOCK.match(stripped):
            skipping = True
            continue
        if skipping:
            if stripped.endswith("?") or re.match(r"^\d+[\).:-]\s", stripped):
                continue
            if not stripped:
                skipping = False
                continue
            skipping = False
        if stripped.endswith("?") and len(stripped) < 200 and "?" in stripped[:80]:
            if re.match(r"(?i)^(what|why|how|when|where|who|which|can you|do you)\b", stripped):
                continue
        out.append(line)
    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()
    return cleaned or text


def _polish_history_teacher_text(text: str) -> str:
    """Light cleanup for history lessons — preserve personality, never inject questions."""
    raw = str(text or "").strip()
    if not raw:
        return raw
    cleaned = re.sub(r"[*_`#>]", "", raw)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    lines = []
    for line in cleaned.split("\n"):
        ls = line.strip()
        if re.match(r"(?i)^discussion questions?\s*:?\s*$", ls):
            continue
        if re.match(r"(?i)^what do you think(?: so far)?\??\s*$", ls):
            continue
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    cleaned = re.sub(r"(?i)\bwhat do you think so far\?\s*", "", cleaned)
    return cleaned.strip()


def _polish_conversational_teacher_text(text: str) -> str:
    """Remove robotic patterns, banned phrases, and repetitive labels."""
    raw = str(text or "").strip()
    if not raw:
        return raw

    cleaned = re.sub(r"[*_`#>]", "", raw)
    cleaned = re.sub(r"(?im)^\s*unit title:?\s*.*$", "", cleaned)
    cleaned = re.sub(r"(?im)^\s*\*\*unit title:?\*\*\s*.*$", "", cleaned)
    cleaned = re.sub(r"(?i)\bwhat do you think so far\?\s*", "", cleaned)
    cleaned = re.sub(
        r"(?i)^(?:hey there!?|hi there!?|hello!?)\s*",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"(?i)^today (?:we(?:'| a)?re going to learn|we will learn)[^.!?]*[.!?]\s*",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"(?i)^science is all about[^.!?]*[.!?]\s*",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"(?i)\b(?:today (?:in|we(?:'| a)?re (?:in|learning))|in grade \d+ (?:science|english|history|chemistry))\b[^.!?]*[.!?]\s*",
        "",
        cleaned,
        count=0,
    )
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    lines = []
    for line in cleaned.split("\n"):
        ls = line.strip()
        if re.match(r"(?i)^what do you think(?: so far)?\??\s*$", ls):
            continue
        if re.match(r"(?i)^discussion questions?\s*:?\s*$", ls):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _format_teacher_for_speech(text: str) -> str:
    """
    Format teacher text for natural avatar speech.
    Preserves paragraph breaks as pauses; never injects engagement questions.
    """
    polished = _polish_conversational_teacher_text(text)
    if not polished:
        return polished

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", polished) if p.strip()]
    if not paragraphs:
        paragraphs = [polished]

    speech_blocks: List[str] = []
    for para in paragraphs:
        # Normalize inline whitespace but keep sentences intact.
        para_clean = re.sub(r"\s+", " ", para).strip()
        if not para_clean:
            continue

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", para_clean) if s.strip()]
        if not sentences:
            speech_blocks.append(para_clean)
            continue

        buffer: List[str] = []
        for sent in sentences:
            if sent and sent[-1] not in ".!?":
                sent = f"{sent}."
            buffer.append(sent)
            # Group 2-3 sentences per speech block for natural pacing between ideas.
            if len(buffer) >= 3:
                speech_blocks.append(" ".join(buffer))
                buffer = []
        if buffer:
            speech_blocks.append(" ".join(buffer))

    return "\n\n".join(speech_blocks).strip()


def _enforce_kid_friendly_delivery(text: str) -> str:
    """Backward-compatible alias for avatar speech formatting."""
    return _format_teacher_for_speech(text)


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
    
    # Use unit_id as plan key only when it's a real Chroma ID (contains ":").
    # LLM-generated short IDs (e.g. "u1") collide across lessons — use chapter_id instead.
    if unit_id and ":" in str(unit_id) and unit_id != state["chapter_id"]:
        plan_key = unit_id
    else:
        plan_key = state["chapter_id"]
    
    print(f"[DEBUG] ensure_unit_plan: Using plan_key={plan_key} for unit_id={unit_id}")
    
    book_id = state["chapter_id"].split(":")[0] if ":" in state["chapter_id"] else state["chapter_id"]
    from .book_plan_service import load_approved_canonical_unit_plan
    from .subject_registry import filter_unit_plan_for_subject, resolve_subject_key_from_chapter

    subject_key = resolve_subject_key_from_chapter(state["chapter_id"])

    canonical = load_approved_canonical_unit_plan(book_id, plan_key)
    if canonical:
        print(f"[DEBUG] ensure_unit_plan: Loaded approved canonical plan for {plan_key}")
        state["unit_plan"] = filter_unit_plan_for_subject(canonical, subject_key) or canonical
        return state

    plan = load_unit_plan(state["student_id"], plan_key)
    if plan:
        print(f"[DEBUG] ensure_unit_plan: Loaded existing plan for {plan_key}")
        state["unit_plan"] = filter_unit_plan_for_subject(plan, subject_key) or plan
        return state

    # Build plan from lesson-scoped textbook pages only (never whole-book retrieval).
    retrieve_id = unit_id if unit_id != state["chapter_id"] else state["chapter_id"]
    from .lesson_content_mapping import (
        build_lesson_plan_context,
        forbidden_lesson_titles,
        retrieve_lesson_pages_for_plan,
        validate_plan_lesson_scope,
    )
    from .unit_detection import normalize_manifest_unit_id

    plan_unit = dict(current_unit)
    short = normalize_manifest_unit_id(
        plan_unit.get("unit_id") or retrieve_id.split(":")[-1],
        book_id,
    )
    plan_unit.setdefault("unit_id", short)
    plan_unit.setdefault("real_unit_id", retrieve_id)

    chunks, mapping = retrieve_lesson_pages_for_plan(
        retrieve_id,
        book_id=book_id,
        plan_unit=plan_unit,
        max_chunks=24,
    )
    unit_title_fb = current_unit.get("title") or mapping.get("title") or "Unit Content"
    start_page = int(mapping.get("start_page") or plan_unit.get("start_page") or 0)
    end_page = int(mapping.get("end_page") or plan_unit.get("end_page") or start_page)
    forbidden = forbidden_lesson_titles(book_id, short)

    if not chunks:
        print(f"[DEBUG] No page-scoped chunks for {retrieve_id} — planning from lesson metadata only")
        context = build_lesson_plan_context(
            title=unit_title_fb,
            start_page=start_page,
            end_page=end_page,
            chunks=[],
            subject_key=subject_key,
        )
    else:
        context = build_lesson_plan_context(
            title=unit_title_fb,
            start_page=start_page,
            end_page=end_page,
            chunks=chunks,
            subject_key=subject_key,
        )

    msg = llm.invoke([
        {"role": "system", "content": UNIT_PLAN_PROMPT},
        {"role": "user", "content": context},
    ])

    try:
        plan = json_safe(msg.content)
    except Exception:
        unit_title_fb = current_unit.get("title") or "Unit Content"
        plan = {
            "unit_title": unit_title_fb,
            "items": [{"id": "content", "type": "other", "title": unit_title_fb, "must_cover": True, "keywords": current_unit.get("keywords", [])}]
        }
    print(f"[DEBUG] ensure_unit_plan: Saving new plan for {plan_key} with {len(plan.get('items', []))} items")
    plan = filter_unit_plan_for_subject(plan, subject_key) or plan
    plan = validate_plan_lesson_scope(
        plan,
        lesson_title=unit_title_fb,
        forbidden_titles=forbidden,
    )
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

    # Language lessons: unit_part selects Reading/Grammar/Listening/Pronunciation item.
    current_unit = state.get("current_unit") or {}
    unit_part = int(current_unit.get("unit_part", state.get("unit_part", 0)) or 0)
    book_id = str(state.get("chapter_id", "")).split(":")[0]
    from .language_lesson_sections import item_index_for_section, uses_language_sections

    if uses_language_sections(book_id):
        section_idx = item_index_for_section(items, unit_part)
        if section_idx >= 0:
            idx = section_idx
            state["progress"]["current_item_index"] = idx
            from .progress_store import save_unit_progress
            save_unit_progress(state["student_id"], state["chapter_id"], state["progress"])

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
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_listening

    subject_key = resolve_subject_key_from_chapter(state.get("chapter_id") or "")

    # Grading flow — do not regenerate lesson or listening content.
    if state.get("provided_quiz") and (state.get("student_answer") or "").strip():
        unit_id = _unit_id_from_state(state)
        if subject_supports_listening(subject_key) and not state.get("listening"):
            cached = load_listening(unit_id)
            if cached:
                state["listening"] = cached
        return state

    # Check if current_item exists
    if "current_item" not in state or not state.get("current_item"):
        state["done"] = True
        state["teacher_text"] = "Error: No current item to teach. Please check the unit plan."
        return state
    
    item = state["current_item"]
    item_type = item.get("type", "")
    item_id = item.get("id", "")
    base_query = " ".join(item.get("keywords", [])) or item.get("title", "")

    current_unit = state.get("current_unit", {})
    book_id = state["chapter_id"].split(":")[0] if ":" in state.get("chapter_id", "") else state["chapter_id"]
    from .lesson_content_mapping import ensure_lesson_mapping

    chapter_for_mapping = state.get("chapter_id") or current_unit.get("real_unit_id") or current_unit.get("unit_id")
    lesson_mapping = current_unit.get("lesson_mapping") or ensure_lesson_mapping(
        str(chapter_for_mapping),
        book_id=book_id,
        plan_unit=current_unit,
    )
    unit_id = str(lesson_mapping.get("lesson_id") or chapter_for_mapping)
    unit_part = current_unit.get("unit_part", 0)  # 0 = first half, 1 = second half
    unit_pages = dict(current_unit.get("unit_pages") or {})
    if not unit_pages.get("start_page") and lesson_mapping.get("start_page"):
        unit_pages["start_page"] = lesson_mapping["start_page"]
    if not unit_pages.get("end_page") and lesson_mapping.get("end_page"):
        unit_pages["end_page"] = lesson_mapping["end_page"]
    unit_title = (
        lesson_mapping.get("title")
        or current_unit.get("title")
        or state.get("unit_plan", {}).get("unit_title", "")
    )
    has_mapped_chunks = bool(lesson_mapping.get("chunk_ids"))
    
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
    
    # Add page/section context to query
    from .language_lesson_sections import (
        filter_chunks_for_section,
        section_type_for_index,
        section_title_for_index,
        uses_language_sections,
    )

    if uses_language_sections(book_id):
        sec_title = section_title_for_index(int(unit_part))
        query = f"{query} {sec_title} section".strip()
    elif unit_part == 0:
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
    
    # Page range / section context for this teaching turn.
    from .language_lesson_sections import part_page_range

    start_page = int(unit_pages.get("start_page") or 0) if unit_pages else 0
    end_page = int(unit_pages.get("end_page") or 0) if unit_pages else 0

    if uses_language_sections(book_id):
        sec_title = section_title_for_index(int(unit_part))
        if start_page > 0 and end_page >= start_page:
            pages_desc = f"{sec_title} section (lesson pages {start_page}–{end_page})"
        else:
            pages_desc = f"{sec_title} section of this lesson"
    elif start_page > 0 and end_page >= start_page:
        part_start, part_end = part_page_range(start_page, end_page, int(unit_part))
        pages_desc = f"pages {part_start} to {part_end} ({'first' if unit_part == 0 else 'second'} half of this lesson)"
    else:
        part_start = part_end = 0
        pages_desc = "this lesson (page range unavailable — use mapped lesson text only)"
    
    # Retrieve chunks — history uses lesson-scoped RAG; other subjects use ingested unit chunks.
    is_history_unit = _is_history_chapter(str(state.get("chapter_id", ""))) or _is_history_chapter(str(unit_id))
    lesson_source = "insufficient_textbook"

    if is_history_unit:
        from .history_rag import HistoryRagError, retrieve_history_chunks
        from .history_lessons import get_lesson_by_unit_id

        hist_lesson = get_lesson_by_unit_id(str(unit_id))
        try:
            chunks = retrieve_history_chunks(
                str(unit_id), query, k=12, lesson=hist_lesson, strict=True
            )
            lesson_source = "retrieved_textbook_history"
        except HistoryRagError as exc:
            print(f"[history] teach_item RAG error: {exc}")
            _log_lesson_retrieval(lesson_id=str(unit_id), chunks=[], source="insufficient_textbook")
            state["retrieved_chunks"] = []
            state["unit_part"] = unit_part
            state["lesson_source"] = "insufficient_textbook"
            state["teacher_text"] = INSUFFICIENT_TEXTBOOK_MESSAGE
            state["quiz"] = {}
            return state
    else:
        chunks, lesson_source, lesson_mapping = _retrieve_lesson_chunks(
            unit_id,
            query,
            book_id=book_id,
            plan_unit=current_unit,
            unit_part=unit_part,
            unit_pages=unit_pages,
            k=20,
        )
        has_mapped_chunks = has_mapped_chunks or bool(lesson_mapping.get("chunk_ids"))

        if uses_language_sections(book_id):
            chunks = filter_chunks_for_section(chunks, section_type_for_index(int(unit_part)))

        if item_type in ["visual", "discussion", "exercises"] or item_id in ["visual_elements", "discussion_questions", "exercises"]:
            if not has_mapped_chunks:
                broader_query = f"{unit_title} {base_query}" if unit_title and base_query else (unit_title or base_query)
                extra, extra_source, _extra_map = _retrieve_lesson_chunks(
                    unit_id,
                    broader_query,
                    book_id=book_id,
                    plan_unit=current_unit,
                    unit_part=unit_part,
                    unit_pages=unit_pages,
                    k=10,
                )
                existing_texts = {c["text"][:100] for c in chunks}
                for chunk in extra:
                    if chunk["text"][:100] not in existing_texts:
                        chunks.append(chunk)
                        existing_texts.add(chunk["text"][:100])
                if extra and not chunks:
                    chunks = extra
                    lesson_source = extra_source
            chunks.sort(key=lambda c: int(c["meta"].get("pdf_page") or 0))

    state["retrieved_chunks"] = chunks
    state["unit_part"] = unit_part
    state["pages_desc"] = pages_desc
    state["lesson_source"] = lesson_source

    # Dedicated listening item — language subjects only.
    if item_type == "listening":
        if not subject_supports_listening(subject_key):
            state["teacher_text"] = ""
            return state
        book_context = "\n\n".join(c["text"] for c in chunks) if chunks else gather_book_context(unit_id)
        curriculum_qs = extract_curriculum_listening_questions(book_context)
        lesson_content = _build_lesson_content_for_listening(state, book_context)
        activity = _generate_listening_for_state(
            state,
            lesson_content=lesson_content,
            book_context=book_context,
            curriculum_questions=curriculum_qs,
        )
        if activity:
            state["listening"] = activity
            transcript = (activity.get("transcript") or activity.get("narration_text") or "").strip()
            state["teacher_text"] = transcript
            p = state["progress"]
            p["listening_question_index"] = 0
            p.pop("listening_completed", None)
            save_unit_progress(state["student_id"], state["chapter_id"], p)
        else:
            state["teacher_text"] = "Listening activity could not be generated. Please try again later."
        return state

    textbook_chars = sum(len(str(c.get("text") or "")) for c in chunks)
    extraction_validation = lesson_mapping.get("extraction_validation") or {}
    section_validation = lesson_mapping.get("section_validation") or {}
    if not is_history_unit and section_validation and not section_validation.get("ok"):
        print(
            f"[lesson-generation] English section validation failed for {unit_id}: "
            f"{section_validation.get('errors')}"
        )
        state["lesson_source"] = "insufficient_textbook"
        state["teacher_text"] = INSUFFICIENT_TEXTBOOK_MESSAGE
        state["quiz"] = {}
        return state
    if not is_history_unit and extraction_validation and not extraction_validation.get("ok"):
        print(
            f"[lesson-generation] extraction validation failed for {unit_id}: "
            f"{extraction_validation.get('errors')}"
        )
        state["lesson_source"] = "insufficient_textbook"
        state["teacher_text"] = INSUFFICIENT_TEXTBOOK_MESSAGE
        state["quiz"] = {}
        return state

    if not chunks or (textbook_chars < 80 and not has_mapped_chunks):
        print(
            f"[lesson-generation] insufficient textbook content for {unit_id} "
            f"(chars={textbook_chars}, mapped={has_mapped_chunks})"
        )
        state["lesson_source"] = "insufficient_textbook"
        state["teacher_text"] = INSUFFICIENT_TEXTBOOK_MESSAGE
        state["quiz"] = {}
        return state

    context_body = _format_textbook_context(chunks)
    if is_history_unit:
        context_body = _strip_history_workbook_content(context_body)

    try:
        is_history = is_history_unit
        history_scope = ""
        history_lesson = None
        if is_history:
            from .history_lessons import (
                get_lesson_by_unit_id,
                build_teaching_scope_block,
                validate_teacher_lesson,
            )
            history_lesson = get_lesson_by_unit_id(str(unit_id))
            if history_lesson and (not unit_title or unit_title != history_lesson.get("title")):
                unit_title = history_lesson.get("title") or unit_title
            if history_lesson:
                history_scope = build_teaching_scope_block(history_lesson)

        user_content = _build_textbook_teaching_prompt(
            unit_title=unit_title or "",
            item=item,
            context=context_body,
            unit_part=int(unit_part or 0),
            history_scope=history_scope,
        )

        print(f"[lesson-generation] lesson_id={unit_id} source={lesson_source} generating from textbook")

        if is_history:
            generated_text = ""
            validation: Dict[str, Any] = {"valid": False, "errors": ["not generated"]}
            prompt_user = user_content
            for attempt in range(3):
                msg = llm.invoke([
                    {"role": "system", "content": HISTORY_TEACHER_PROMPT},
                    {"role": "user", "content": prompt_user},
                ])
                generated_text = msg.content if msg and msg.content else ""
                if history_lesson:
                    validation = validate_teacher_lesson(
                        generated_text, history_lesson, part_index=0
                    )
                    if validation.get("valid"):
                        print(
                            f"[history] lesson OK: {validation.get('word_count')} words, "
                            f"{validation.get('explanation_ratio', 0):.0%} explanation"
                        )
                        break
                    print(f"[WARN] History teacher attempt {attempt + 1} failed: {validation.get('errors')}")
                    prompt_user = (
                        user_content
                        + "\n\nREGENERATE. You failed validation:\n- "
                        + "\n- ".join(validation.get("errors") or [])
                        + "\n\nStart with the FIRST concept from the textbook excerpts. No greeting. Stay faithful to the book."
                    )
                else:
                    break
        else:
            msg = llm.invoke([
                {"role": "system", "content": TEACH_ITEM_PROMPT},
                {"role": "user", "content": user_content},
            ])
            generated_text = msg.content if msg and msg.content else ""
            if not generated_text:
                generated_text = "Error: LLM returned empty response."
            elif _looks_like_generic_lesson(generated_text, context_body):
                print(
                    f"[lesson-generation] generic opener detected for {unit_id}; "
                    f"retrying with stricter textbook grounding"
                )
                retry_user = _build_textbook_teaching_prompt(
                    unit_title=unit_title or "",
                    item=item,
                    context=context_body,
                    unit_part=int(unit_part or 0),
                    history_scope=(
                        "REGENERATE. Your previous answer used a generic greeting or invented example. "
                        "Start with the FIRST sentence teaching the opening concept from the excerpts. "
                        "No greeting. No examples unless they appear in the excerpts."
                    ),
                )
                msg_retry = llm.invoke([
                    {"role": "system", "content": TEACH_ITEM_PROMPT},
                    {"role": "user", "content": retry_user},
                ])
                if msg_retry and msg_retry.content:
                    generated_text = msg_retry.content

        if unit_title and not is_history:
            from .lesson_content_mapping import (
                forbidden_lesson_titles,
                validate_generated_teaching_text,
            )
            from .unit_detection import normalize_manifest_unit_id

            next_lesson = (current_unit.get("lesson_info") or {}).get("next_lesson") or {}
            next_title = str(next_lesson.get("title") or "")
            source_text = "\n".join(str(c.get("text") or "") for c in chunks)
            gen_validation = validate_generated_teaching_text(
                generated_text,
                lesson_title=unit_title,
                source_text=source_text,
                next_lesson_title=next_title,
            )
            if not gen_validation.get("ok"):
                print(
                    f"[lesson-generation] generated text validation failed for {unit_id}: "
                    f"{gen_validation.get('errors')}"
                )
                user_content_retry = _build_textbook_teaching_prompt(
                    unit_title=unit_title,
                    item=item,
                    context=context_body,
                    unit_part=int(unit_part or 0),
                    history_scope=(
                        "REGENERATE. Your previous answer failed validation:\n- "
                        + "\n- ".join(gen_validation.get("errors") or [])
                        + f"\n\nTeach ONLY: {unit_title}. Use ONLY the textbook excerpts."
                    ),
                )
                msg_retry = llm.invoke([
                    {"role": "system", "content": TEACH_ITEM_PROMPT},
                    {"role": "user", "content": user_content_retry},
                ])
                if msg_retry and msg_retry.content:
                    generated_text = msg_retry.content

            generated_lower = generated_text.lower()
            unit_title_lower = unit_title.lower()
            short_unit = normalize_manifest_unit_id(
                str(current_unit.get("unit_id") or unit_id.split(":")[-1]),
                book_id,
            )
            for forbidden_title in forbidden_lesson_titles(book_id, short_unit):
                ft_lower = forbidden_title.lower()
                if ft_lower in generated_lower and ft_lower not in unit_title_lower:
                    if f"**{ft_lower}" in generated_lower or f"# {ft_lower}" in generated_lower:
                        user_content_retry = _build_textbook_teaching_prompt(
                            unit_title=unit_title,
                            item=item,
                            context=context_body,
                            unit_part=int(unit_part or 0),
                            history_scope=(
                                "Your previous answer used the wrong topic. "
                                f"Teach ONLY: {unit_title}. Start with the first excerpt concept."
                            ),
                        )
                        msg_retry = llm.invoke([
                            {"role": "system", "content": TEACH_ITEM_PROMPT},
                            {"role": "user", "content": user_content_retry},
                        ])
                        generated_text = msg_retry.content if msg_retry and msg_retry.content else generated_text
                        break

        if is_history:
            state["teacher_text"] = _format_teacher_for_speech(_polish_history_teacher_text(generated_text))
        else:
            state["teacher_text"] = _format_teacher_for_speech(generated_text)
        state["lesson_source"] = lesson_source
        print(f"[lesson-generation] completed lesson_id={unit_id} source={lesson_source}")
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to generate teacher_text: {e}")
        traceback.print_exc()
        state["teacher_text"] = f"Error generating lesson content: {str(e)}"

    return state


def coverage_guard(state: LessonState):
    # History lessons are validated in teach_item; English coverage guard would rewrite with question-heavy prompts.
    chapter_id = str(state.get("chapter_id", ""))
    unit_id = str((state.get("current_unit") or {}).get("unit_id", ""))
    if _is_history_chapter(chapter_id) or _is_history_chapter(unit_id):
        return state

    # Check if current_item exists
    if "current_item" not in state or not state.get("current_item"):
        return state

    item = state["current_item"]
    if item.get("type") == "listening":
        return state

    chunks = state.get("retrieved_chunks", [])
    context_body = _format_textbook_context(chunks) if chunks else ""
    context_plain = "\n\n".join(c["text"] for c in chunks)
    current_unit = state.get("current_unit") if isinstance(state.get("current_unit"), dict) else {}
    unit_part = int(current_unit.get("unit_part", state.get("unit_part", 0)) or 0)
    unit_title = str(
        current_unit.get("title")
        or (state.get("unit_plan") or {}).get("unit_title")
        or ""
    )

    msg = llm.invoke([
        {"role": "system", "content": COVERAGE_GUARD_PROMPT},
        {"role": "user", "content": f"""
Item:
{item}

Teacher explanation:
{state["teacher_text"]}

Book context:
{context_plain}
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
    if not result.get("covered") and context_body:
        fix_user = _build_textbook_teaching_prompt(
            unit_title=unit_title,
            item=item,
            context=context_body,
            unit_part=unit_part,
            history_scope=(
                "Fix the lesson using ONLY the excerpts above.\n"
                f"Coverage gaps to address:\n{result.get('fix_instructions', '')}"
            ),
        )
        fix_msg = llm.invoke([
            {"role": "system", "content": TEACH_ITEM_PROMPT},
            {"role": "user", "content": fix_user},
        ])
        if fix_msg and fix_msg.content:
            state["teacher_text"] = _format_teacher_for_speech(fix_msg.content)

    return state


def _norm_mcq_text(s: str) -> str:
    return re.sub(r"[^\w\s]", "", str(s)).lower().strip()


def _quiz_has_mcq_options(quiz: Dict[str, Any]) -> bool:
    opts = quiz.get("options")
    return isinstance(opts, list) and len([o for o in opts if str(o).strip()]) >= 2


def _word_overlap_score(a: str, b: str) -> int:
    wa = set(_norm_mcq_text(a).split())
    wb = set(_norm_mcq_text(b).split())
    if not wa or not wb:
        return 0
    return len(wa & wb)


def _resolve_correct_option(
    options: List[str],
    correct_answer: str,
    *,
    source_quote: str = "",
) -> Optional[str]:
    """Map LLM correct_answer text to one of the MCQ options."""
    correct = str(correct_answer or "").strip()
    if not options:
        return None

    if correct:
        for opt in options:
            if _norm_mcq_text(opt) == _norm_mcq_text(correct):
                return opt

        cn = _norm_mcq_text(correct)
        for opt in options:
            on = _norm_mcq_text(opt)
            if cn and (cn in on or on in cn):
                return opt

    quote = str(source_quote or "").strip()
    if quote:
        best: Optional[str] = None
        best_score = 0
        for opt in options:
            score = _word_overlap_score(quote, opt)
            if score > best_score:
                best_score = score
                best = opt
        if best is not None and best_score >= 2:
            return best

    if correct:
        best = None
        best_score = 0
        for opt in options:
            score = _word_overlap_score(correct, opt)
            if score > best_score:
                best_score = score
                best = opt
        if best is not None and best_score >= 2:
            return best

    return None


def _best_option_fallback(
    options: List[str],
    correct_answer: str,
    source_quote: str,
) -> str:
    """Last-resort pick when exact resolution fails — never blindly use index 0."""
    scored = [
        (
            max(
                _word_overlap_score(correct_answer, opt),
                _word_overlap_score(source_quote, opt),
            ),
            opt,
        )
        for opt in options
    ]
    scored.sort(key=lambda row: row[0], reverse=True)
    if scored and scored[0][0] > 0:
        return scored[0][1]
    return options[0]


def ensure_mcq_integrity(quiz_data: Dict[str, Any], *, shuffle: bool = True) -> Dict[str, Any]:
    import random as _random

    quiz = dict(quiz_data)
    options = [str(o).strip() for o in (quiz.get("options") or []) if str(o).strip()]
    if len(options) < 2:
        return quiz

    stored_index = quiz.get("correct_index")
    if not shuffle and stored_index is not None:
        idx = int(stored_index)
        if 0 <= idx < len(options):
            quiz["options"] = options
            quiz["correct_answer"] = options[idx]
            quiz["correct_index"] = idx
            return quiz

    correct = str(quiz.get("correct_answer", "")).strip()
    source_quote = str(quiz.get("source_quote") or "").strip()
    correct_opt = _resolve_correct_option(options, correct, source_quote=source_quote)
    if not correct_opt:
        print(
            f"[WARN] MCQ correct_answer not in options — using overlap fallback. "
            f"correct_answer={correct!r} options={options!r} source_quote={source_quote!r}"
        )
        correct_opt = _best_option_fallback(options, correct, source_quote)

    if shuffle:
        _random.shuffle(options)
    quiz["options"] = options
    for i, opt in enumerate(options):
        if _norm_mcq_text(opt) == _norm_mcq_text(correct_opt):
            quiz["correct_answer"] = opt
            quiz["correct_index"] = i
            break
    return quiz


def grade_mcq_answer(
    quiz: Dict[str, Any],
    student_answer: str,
    option_index: Optional[int] = None,
) -> Dict[str, Any]:
    q = ensure_mcq_integrity(quiz, shuffle=False)
    options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
    correct_idx = q.get("correct_index")

    correct_opt: Optional[str] = None
    if correct_idx is not None and 0 <= int(correct_idx) < len(options):
        correct_opt = options[int(correct_idx)]
    else:
        correct = str(q.get("correct_answer", "")).strip()
        correct_opt = _resolve_correct_option(options, correct, source_quote=str(q.get("source_quote") or ""))
        if not correct_opt:
            correct_opt = next(
                (opt for opt in options if _norm_mcq_text(opt) == _norm_mcq_text(correct)),
                correct or (options[0] if options else ""),
            )

    selected: Optional[str] = None
    if option_index is not None and 0 <= int(option_index) < len(options):
        selected = options[int(option_index)]
    if not selected and student_answer:
        for opt in options:
            if _norm_mcq_text(opt) == _norm_mcq_text(student_answer):
                selected = opt
                break

    if (
        option_index is not None
        and correct_idx is not None
        and 0 <= int(option_index) < len(options)
        and 0 <= int(correct_idx) < len(options)
    ):
        is_correct = int(option_index) == int(correct_idx)
    else:
        is_correct = bool(
            selected
            and correct_opt
            and _norm_mcq_text(selected) == _norm_mcq_text(correct_opt)
        )

    if is_correct:
        feedback = f"That's correct! \"{correct_opt}\" is the right answer."
    else:
        shown = selected or student_answer or "?"
        feedback = f"Not quite. You chose \"{shown}\". The correct answer is \"{correct_opt}\"."

    return {
        "correct": is_correct,
        "feedback": feedback,
        "missing": [] if is_correct else [correct_opt or ""],
        "quiz": q,
    }


def _get_book_context_for_quiz(state: LessonState) -> str:
    chunks = state.get("retrieved_chunks") or []
    if chunks:
        return _format_textbook_context(chunks[:8])

    current_unit = state.get("current_unit") if isinstance(state.get("current_unit"), dict) else {}
    unit_id = str(current_unit.get("unit_id") or current_unit.get("real_unit_id") or state.get("chapter_id") or "")
    if not unit_id:
        return ""

    unit_part = current_unit.get("unit_part")
    unit_pages = current_unit.get("unit_pages")

    if _is_history_chapter(unit_id) or _is_history_chapter(str(state.get("chapter_id", ""))):
        from .history_rag import HistoryRagError, retrieve_history_chunks
        from .history_lessons import get_lesson_by_unit_id

        hist_lesson = get_lesson_by_unit_id(unit_id)
        try:
            chunks = retrieve_history_chunks(
                unit_id, "key facts concepts summary educational", k=8,
                lesson=hist_lesson, strict=True,
            )
        except HistoryRagError:
            chunks = []
        if chunks:
            return _format_textbook_context(chunks[:8])

    chunks, _source, _mapping = _retrieve_lesson_chunks(
        unit_id,
        "key facts concepts summary educational",
        book_id=state["chapter_id"].split(":")[0] if ":" in state.get("chapter_id", "") else state.get("chapter_id", ""),
        plan_unit=current_unit,
        unit_part=unit_part,
        unit_pages=unit_pages,
        k=8,
    )
    if chunks:
        return _format_textbook_context(chunks[:8])
    return ""


def lesson_question_to_quiz(question: Dict[str, Any], index: int, total: int) -> Dict[str, Any]:
    q = ensure_mcq_integrity(dict(question), shuffle=False) if _quiz_has_mcq_options(question) else dict(question)
    q["lesson_question_index"] = index
    q["lesson_question_total"] = total
    return q


def _parse_mcq_bank(raw: Any, count: int = LESSON_MCQ_COUNT) -> List[Dict[str, Any]]:
    if isinstance(raw, dict):
        items = raw.get("questions") or raw.get("items") or []
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    bank: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict) or not _quiz_has_mcq_options(item):
            continue
        bank.append(ensure_mcq_integrity(item, shuffle=True))
        if len(bank) >= count:
            break
    return bank


def _invoke_mcq_bank(system_prompt: str, user_content: str) -> List[Dict[str, Any]]:
    bank: List[Dict[str, Any]] = []
    for _ in range(2):
        msg = llm.invoke([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ])
        parsed = json_safe(msg.content) if msg and msg.content else {}
        bank = _parse_mcq_bank(parsed, LESSON_MCQ_COUNT)
        if len(bank) >= LESSON_MCQ_COUNT:
            break
    return bank[:LESSON_MCQ_COUNT]


def _serve_lesson_mcq_from_progress(state: LessonState, item_id: str) -> bool:
    p = state["progress"]
    bank = p.get("lesson_questions")
    stored_item = p.get("lesson_questions_item_id")
    if not bank or not isinstance(bank, list) or not bank:
        return False
    if stored_item and item_id and stored_item != item_id:
        return False
    idx = max(0, min(int(p.get("lesson_question_index", 0) or 0), len(bank) - 1))
    state["quiz"] = lesson_question_to_quiz(bank[idx], idx, len(bank))
    return True


def _store_lesson_mcq_bank(state: LessonState, item_id: str, bank: List[Dict[str, Any]]) -> None:
    p = state["progress"]
    p["lesson_questions"] = bank
    p["lesson_question_index"] = 0
    p["lesson_questions_item_id"] = item_id
    save_unit_progress(state["student_id"], state["chapter_id"], p)
    state["quiz"] = lesson_question_to_quiz(bank[0], 0, len(bank))


def _generate_and_store_lesson_mcq_bank(
    state: LessonState,
    item_id: str,
    system_prompt: str,
    user_content: str,
    *,
    fallback_question: str,
) -> None:
    if _serve_lesson_mcq_from_progress(state, item_id):
        return
    bank = _invoke_mcq_bank(system_prompt, user_content)
    if bank:
        _store_lesson_mcq_bank(state, item_id, bank)
        return
    state["quiz"] = {
        "question": fallback_question,
        "expected_points": ["Understanding of the main concepts"],
    }


def make_quiz(state: LessonState):
    # If we were given a quiz (e.g. /session/answer), reuse it so we grade the same question.
    provided = state.get("provided_quiz")
    if provided:
        q = dict(provided)
        if _quiz_has_mcq_options(q):
            state["quiz"] = ensure_mcq_integrity(q, shuffle=False)
        else:
            state["quiz"] = q
        return state

    # NEW quiz being generated - reset hint_count to 0 for this new quiz
    p = state["progress"]
    p["hint_count"] = 0
    state["hint_count"] = 0
    save_unit_progress(state["student_id"], state["chapter_id"], p)

    current_item = state.get("current_item") or {}
    is_listening_item = current_item.get("type") == "listening"
    is_listening_phase = bool(state.get("listening_phase"))
    unit_id = _unit_id_from_state(state)
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_listening

    listening_allowed = subject_supports_listening(
        resolve_subject_key_from_chapter(state.get("chapter_id") or "")
    )

    if listening_allowed and (is_listening_item or is_listening_phase):
        activity = state.get("listening") or load_listening(unit_id)
        if activity:
            state["listening"] = activity
            idx = int(p.get("listening_question_index", 0) or 0)
            questions = activity.get("questions") or []
            if questions:
                idx = max(0, min(idx, len(questions) - 1))
                state["quiz"] = listening_question_to_quiz(questions[idx], idx, len(questions))
                state["quiz"] = ensure_mcq_integrity(state["quiz"], shuffle=False)
                return state

    # Check if teacher_text exists and is not empty — no quiz before section content exists.
    teacher_text = state.get("teacher_text", "")
    if (
        not teacher_text
        or teacher_text.strip() == ""
        or INSUFFICIENT_TEXTBOOK_MESSAGE in teacher_text
        or len(teacher_text.strip()) < 80
    ):
        state["quiz"] = None
        return state

    chapter_id = str(state.get("chapter_id") or "")
    current_unit = state.get("current_unit") if isinstance(state.get("current_unit"), dict) else {}
    unit_title = str(current_unit.get("title") or current_unit.get("name") or "").strip()
    current_item = state.get("current_item") or {}
    is_speaking_item = (
        current_item.get("type") == "speaking"
        or str(current_item.get("id", "")).startswith("speaking")
    )
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_pronunciation

    pronunciation_allowed = subject_supports_pronunciation(
        resolve_subject_key_from_chapter(state.get("chapter_id") or "")
    )
    use_mcq = _is_history_chapter(chapter_id) or _is_history_chapter(
        str(current_unit.get("unit_id") or current_unit.get("real_unit_id") or "")
    )

    try:
        if is_speaking_item and pronunciation_allowed and not use_mcq:
            msg = llm.invoke([
                {"role": "system", "content": SPEAKING_TASK_PROMPT},
                {"role": "user", "content": f"Lesson content:\n{teacher_text[:2000]}"},
            ])
            if msg and msg.content:
                quiz_data = json_safe(msg.content)
                if quiz_data.get("type") == "speaking" and quiz_data.get("sentence"):
                    state["quiz"] = quiz_data
                else:
                    state["quiz"] = {
                        "type": "speaking",
                        "sentence": "pronunciation",
                        "instructions": "Say this word out loud clearly.",
                    }
            else:
                state["quiz"] = {
                    "type": "speaking",
                    "sentence": "pronunciation",
                    "instructions": "Say this word out loud clearly.",
                }
            return state
        elif use_mcq:
            from .history_lessons import get_lesson_by_unit_id, build_teaching_scope_block, part_count
            uid = str(current_unit.get("unit_id") or current_unit.get("real_unit_id") or chapter_id)
            hist_lesson = get_lesson_by_unit_id(uid)
            quiz_part = int(state.get("unit_part", current_unit.get("unit_part", 0)) or 0)
            if hist_lesson:
                unit_title = hist_lesson.get("title") or unit_title
            book_context = _get_book_context_for_quiz(state)
            scope = (
                build_teaching_scope_block(hist_lesson, part_index=quiz_part)
                if hist_lesson
                else ""
            )
            part_note = (
                f"Part {quiz_part + 1} of {part_count(hist_lesson)} — quiz on THIS part only"
                if hist_lesson
                else ""
            )
            user_content = f"""{scope}

LESSON TOPIC (quiz MUST be about this only):
{unit_title or chapter_id}
SESSION: {part_note}

TEXTBOOK CONTENT (ground truth — use ONLY this):
{book_context or teacher_text[:4000]}

TEACHER LESSON (this part only — quiz must test ownedTopics for this part):
{teacher_text[:4000]}
"""
            item_id = str(current_item.get("id") or f"{uid}:part{quiz_part}")
            _generate_and_store_lesson_mcq_bank(
                state,
                item_id,
                MCQ_QUIZ_BANK_PROMPT,
                user_content,
                fallback_question="Please summarize what you learned from this history lesson.",
            )
        else:
            book_context = _get_book_context_for_quiz(state)
            book_id = chapter_id.split(":")[0] if ":" in chapter_id else chapter_id
            from .language_lesson_sections import (
                section_title_for_index,
                section_type_for_index,
                uses_language_sections,
            )
            unit_part = int(state.get("unit_part", current_unit.get("unit_part", 0)) or 0)
            section_block = ""
            if uses_language_sections(book_id):
                sec_title = section_title_for_index(unit_part)
                sec_type = section_type_for_index(unit_part)
                section_block = (
                    f"CURRENT SECTION: {sec_title} ({sec_type})\n"
                    f"The quiz MUST test ONLY the {sec_title} section content below.\n"
                    f"Do NOT ask about other sections.\n"
                )
            english_user_content = f"""LESSON TOPIC: {unit_title or chapter_id}

{section_block}TEXTBOOK CONTENT (this section only):
{book_context or teacher_text[:4000]}

TEACHER LESSON (this section only — quiz must test THIS content only):
{teacher_text[:4000]}
"""
            item_id = str(current_item.get("id") or f"{book_id}:part{unit_part}")
            _generate_and_store_lesson_mcq_bank(
                state,
                item_id,
                ENGLISH_MCQ_QUIZ_BANK_PROMPT,
                english_user_content,
                fallback_question="Please summarize what you learned from this lesson.",
            )
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to generate quiz: {e}")
        traceback.print_exc()
        state["quiz"] = {
            "question": "Please summarize what you learned from this lesson.",
            "expected_points": ["Understanding of the main concepts"],
        }
    
    return state


def evaluate_answer(state: LessonState):
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_listening

    quiz = state.get("quiz", {})
    student_answer = (state.get("student_answer", "") or "").strip()
    raw_index = state.get("option_index")
    option_index: Optional[int] = None
    if raw_index is not None and int(raw_index) >= 0:
        option_index = int(raw_index)

    if quiz.get("type") == "speaking":
        try:
            score = float(student_answer)
        except (ValueError, TypeError):
            score = 0.0
        is_correct = score >= 70.0
        if is_correct:
            feedback = f"Great pronunciation! You scored {score:.0f}%. Well done!"
        elif score >= 50:
            feedback = f"Good effort! You scored {score:.0f}%. Try to pronounce each word a little more clearly."
        else:
            feedback = f"Keep practicing! You scored {score:.0f}%. Listen carefully to each word and try again."
        state["evaluation"] = {
            "correct": is_correct,
            "feedback": feedback,
            "missing": [] if is_correct else ["Clearer pronunciation"],
            "score": score,
        }
    elif _quiz_has_mcq_options(quiz):
        graded = grade_mcq_answer(quiz, student_answer, option_index=option_index)
        state["quiz"] = graded.get("quiz") or quiz
        state["evaluation"] = {
            "correct": graded["correct"],
            "feedback": graded["feedback"],
            "missing": graded.get("missing") or [],
        }
    else:
        msg = llm.invoke([
            {"role": "system", "content": EVAL_PROMPT},
            {"role": "user", "content": f"""
Quiz:
{quiz}

Student answer:
{student_answer}
"""},
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
        quiz_type = (state.get("quiz") or {}).get("type")
        if quiz_type == "listening" and subject_supports_listening(
            resolve_subject_key_from_chapter(state.get("chapter_id") or "")
        ):
            activity = state.get("listening") or load_listening(unit_id)
            questions = (activity or {}).get("questions") or []
            idx = int(p.get("listening_question_index", 0) or 0)
            if activity and idx + 1 < len(questions):
                p["listening_question_index"] = idx + 1
                save_unit_progress(state["student_id"], state["chapter_id"], p)
                state["listening"] = activity
                state["quiz"] = listening_question_to_quiz(questions[idx + 1], idx + 1, len(questions))
                state["quiz"] = ensure_mcq_integrity(state["quiz"], shuffle=False)
                state["listening_more_questions"] = True
                state["advance_text"] = state["evaluation"].get("feedback", "Correct! Next question.")
                state["hint_text"] = ""
                state["remediation_text"] = ""
                state["hint_count"] = 0
                attempt["hint_count_after"] = 0
                hist = p.get("attempt_history", [])
                if not isinstance(hist, list):
                    hist = []
                hist.append(attempt)
                p["attempt_history"] = hist[-200:]
                save_unit_progress(state["student_id"], state["chapter_id"], p)
                record_quiz_attempt(
                    student_id=state["student_id"],
                    unit_id=unit_id,
                    item_id=attempt.get("item_id"),
                    quiz_question=attempt.get("quiz_question"),
                    correct=True,
                    hint_count_before=int(attempt.get("hint_count_before", 0) or 0),
                    hint_count_after=0,
                    remediation_used=False,
                    tutor_quality_signals=state.get("tutor_quality") if isinstance(state.get("tutor_quality"), dict) else None,
                )
                state["evaluation_summary"] = eval_summary(state["student_id"])
                state["recommendations"] = build_recommendations(
                    latest_attempt={
                        "correct": True,
                        "hint_count_after": 0,
                        "remediation_used": False,
                    },
                    evaluation_summary=state["evaluation_summary"],
                    unit_part=unit_part,
                )
                return state
            p["listening_question_index"] = 0
            p["listening_completed"] = True

        elif (
            quiz_type not in ("listening", "speaking")
            and _quiz_has_mcq_options(state.get("quiz", {}))
        ):
            bank = p.get("lesson_questions") or []
            idx = int(p.get("lesson_question_index", 0) or 0)
            if bank and idx + 1 < len(bank):
                p["lesson_question_index"] = idx + 1
                save_unit_progress(state["student_id"], state["chapter_id"], p)
                state["quiz"] = lesson_question_to_quiz(bank[idx + 1], idx + 1, len(bank))
                state["lesson_more_questions"] = True
                state["advance_text"] = state["evaluation"].get("feedback", "Correct! Next question.")
                state["hint_text"] = ""
                state["remediation_text"] = ""
                state["hint_count"] = 0
                attempt["hint_count_after"] = 0
                hist = p.get("attempt_history", [])
                if not isinstance(hist, list):
                    hist = []
                hist.append(attempt)
                p["attempt_history"] = hist[-200:]
                save_unit_progress(state["student_id"], state["chapter_id"], p)
                record_quiz_attempt(
                    student_id=state["student_id"],
                    unit_id=unit_id,
                    item_id=attempt.get("item_id"),
                    quiz_question=attempt.get("quiz_question"),
                    correct=True,
                    hint_count_before=int(attempt.get("hint_count_before", 0) or 0),
                    hint_count_after=0,
                    remediation_used=False,
                    tutor_quality_signals=state.get("tutor_quality") if isinstance(state.get("tutor_quality"), dict) else None,
                )
                state["evaluation_summary"] = eval_summary(state["student_id"])
                state["recommendations"] = build_recommendations(
                    latest_attempt={
                        "correct": True,
                        "hint_count_after": 0,
                        "remediation_used": False,
                    },
                    evaluation_summary=state["evaluation_summary"],
                    unit_part=unit_part,
                )
                return state
            p.pop("lesson_questions", None)
            p.pop("lesson_questions_item_id", None)
            p["lesson_question_index"] = 0

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
        quiz_type = (state.get("quiz") or {}).get("type")
        if quiz_type == "speaking":
            # Pronunciation is threshold-scored (see above), not multiple-choice —
            # there's no "question" to hint about, and student_answer here is just
            # the stringified score. Surface the percentage feedback evaluate_answer
            # already built instead of asking the LLM to hint on an empty question.
            state["hint_text"] = state["evaluation"].get(
                "feedback", "Keep practicing your pronunciation and try again."
            )
            state["remediation_text"] = ""
            attempt["hint_count_after"] = attempt.get("hint_count_before", 0)
            hist = p.get("attempt_history", [])
            if not isinstance(hist, list):
                hist = []
            hist.append(attempt)
            p["attempt_history"] = hist[-200:]
            save_unit_progress(state["student_id"], state["chapter_id"], p)
        else:
            # Get current hint count from progress (default to 0)
            hint_count = p.get("hint_count", 0)

            if hint_count < 2:
                hint_number = hint_count + 1
                is_history_mcq = (
                    _is_history_chapter(state.get("chapter_id", ""))
                    and _quiz_has_mcq_options(state.get("quiz", {}))
                )
                if is_history_mcq:
                    hint_user = f"""Question: {state["quiz"].get("question", "")}
Options: {", ".join(state["quiz"].get("options", []))}
Student's wrong answer: {state.get("student_answer", "")}
Hint number: {hint_number} of 2"""
                else:
                    hint_user = f"""
Teacher explanation:
{state["teacher_text"]}

Quiz question:
{state["quiz"].get("question", "")}

Student's incorrect answer:
{state.get("student_answer", "")}

This is hint number {hint_number} of 2.
"""
                hint = llm.invoke([
                    {"role": "system", "content": HINT_PROMPT.format(hint_number=hint_number)},
                    {"role": "user", "content": hint_user},
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
