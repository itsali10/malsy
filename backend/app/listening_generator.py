"""Generate and cache listening activities from lesson RAG content."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .llm import get_deterministic_llm
from .prompts import LISTENING_ACTIVITY_PROMPT
from .listening_store import load_listening, save_listening

_deterministic_llm = None


def _llm():
    global _deterministic_llm
    if _deterministic_llm is None:
        _deterministic_llm = get_deterministic_llm()
    return _deterministic_llm


def word_count_bounds(grade: int = 6) -> tuple[int, int]:
    grade = max(1, min(12, int(grade)))
    min_words = max(200, 150 + grade * 10)
    max_words = min(350, 220 + grade * 20)
    return min_words, max_words


def compute_source_hash(
    unit_id: str,
    lesson_content: str,
    book_context: str,
    curriculum_questions: List[str],
    grade: int,
) -> str:
    payload = json.dumps(
        {
            "unit_id": unit_id,
            "lesson_content": (lesson_content or "").strip(),
            "book_context": (book_context or "").strip(),
            "curriculum_questions": curriculum_questions,
            "grade": grade,
            "prompt_version": "listening_v1",
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _json_safe(text: str) -> Dict[str, Any]:
    from .lesson_graph import json_safe

    return json_safe(text)


def extract_curriculum_listening_questions(book_context: str) -> List[str]:
    """Pull numbered / circled listening questions from textbook excerpt."""
    text = (book_context or "").strip()
    if not text:
        return []

    questions: List[str] = []
    patterns = [
        re.compile(r"(?im)^\s*(?:\d+[\).:\s]+|@?\s*Listen[^\n]*\n)(.+?\?)\s*$"),
        re.compile(r"(?im)(.{20,180}\?)\s*(?:bridge|tunnel|speaker|true|false|$)"),
    ]
    for pat in patterns:
        for m in pat.finditer(text):
            q = (m.group(1) if m.lastindex else m.group(0)).strip()
            q = re.sub(r"\s+", " ", q)
            if len(q) > 15 and q not in questions:
                questions.append(q)

    # Fallback: ask LLM to extract only if regex found nothing
    if not questions and "listen" in text.lower():
        try:
            msg = _llm().invoke([
                {
                    "role": "system",
                    "content": (
                        "Extract listening comprehension questions from the textbook excerpt. "
                        "Return ONLY JSON: {\"questions\": [\"...\", ...]}. "
                        "Use exact question wording from the book when possible."
                    ),
                },
                {"role": "user", "content": text[:6000]},
            ])
            data = _json_safe(msg.content)
            questions = [q.strip() for q in (data.get("questions") or []) if q and "?" in q]
        except Exception:
            questions = []

    return questions[:12]


def collect_vocabulary_keywords(unit_plan: Dict[str, Any]) -> List[str]:
    words: List[str] = []
    for item in unit_plan.get("items") or []:
        if item.get("type") in ("vocab", "reading", "grammar", "listening"):
            words.extend(item.get("keywords") or [])
    seen: set = set()
    out: List[str] = []
    for w in words:
        key = w.lower().strip()
        if key and key not in seen:
            seen.add(key)
            out.append(w)
    return out[:40]


def gather_book_context(unit_id: str, *, listening_focus: bool = True) -> str:
    from .lesson_graph import retrieve_for_item

    query = (
        "listening comprehension questions circle the correct answer speakers bridge tunnel"
        if listening_focus
        else "reading vocabulary grammar lesson content key facts"
    )
    chunks = retrieve_for_item(unit_id, query, k=16, unit_part=None, unit_pages=None)
    if not chunks:
        chunks = retrieve_for_item(
            unit_id, "lesson vocabulary reading grammar key concepts", k=12, unit_part=None, unit_pages=None
        )
    return "\n\n".join(c["text"] for c in chunks)


def _normalize_activity(raw: Dict[str, Any], unit_id: str, source_hash: str, grade: int) -> Dict[str, Any]:
    transcript = (raw.get("transcript") or raw.get("story") or raw.get("narration_text") or "").strip()
    narration = (raw.get("narration_text") or transcript).strip()
    if narration != transcript:
        narration = transcript

    questions_out: List[Dict[str, Any]] = []
    for i, q in enumerate(raw.get("questions") or [], start=1):
        if not isinstance(q, dict):
            continue
        options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        correct = str(q.get("correct_answer") or "").strip()
        if len(options) < 2:
            continue
        if correct and correct not in options:
            options.append(correct)
        questions_out.append({
            "id": q.get("id") or f"q{i}",
            "question": str(q.get("question") or "").strip(),
            "options": options[:4],
            "correct_answer": correct or options[0],
            "explanation": str(q.get("explanation") or "").strip(),
            "skill": q.get("skill") or "understanding",
        })

    if len(questions_out) < 1:
        raise ValueError("Listening activity has no valid questions")

    title = (raw.get("title") or f"Listening: {unit_id.split(':')[-1]}").strip()
    answers = {q["id"]: q["correct_answer"] for q in questions_out}

    return {
        "unit_id": unit_id,
        "title": title,
        "transcript": transcript,
        "narration_text": narration,
        "story": transcript,
        "questions": questions_out,
        "answers": answers,
        "grade": grade,
        "word_count": len(transcript.split()),
        "source_hash": source_hash,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def ensure_listening_activity(
    unit_id: str,
    *,
    lesson_content: str,
    book_context: str = "",
    unit_title: str = "",
    vocabulary: Optional[List[str]] = None,
    curriculum_questions: Optional[List[str]] = None,
    grade: int = 6,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Return cached listening activity or generate from lesson content.
    Deterministic for the same source_hash (lesson + book context + curriculum questions).
    """
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_listening

    subject_key = resolve_subject_key_from_chapter(unit_id)
    if not subject_supports_listening(subject_key):
        raise ValueError(f"Listening is not supported for subject '{subject_key}'")

    vocab = vocabulary or []
    curriculum = list(curriculum_questions or [])
    if not book_context:
        book_context = gather_book_context(unit_id)

    source_hash = compute_source_hash(unit_id, lesson_content, book_context, curriculum, grade)
    cached = load_listening(unit_id)
    if cached and cached.get("source_hash") == source_hash and not force:
        return cached

    min_words, max_words = word_count_bounds(grade)
    prompt = LISTENING_ACTIVITY_PROMPT.format(grade=grade, min_words=min_words, max_words=max_words)

    curriculum_block = (
        json.dumps(curriculum, ensure_ascii=False, indent=2)
        if curriculum
        else "(none — generate 5–8 new questions from the story)"
    )
    vocab_block = ", ".join(vocab[:30]) if vocab else "(use vocabulary from lesson content)"

    user_content = f"""UNIT / LESSON: {unit_title or unit_id}
GRADE: {grade}

LESSON CONTENT (concepts taught — story must reflect ONLY this):
{(lesson_content or book_context)[:8000]}

TEXTBOOK / RAG EXCERPT (ground truth):
{book_context[:8000]}

TARGET VOCABULARY TO WEAVE IN:
{vocab_block}

CURRICULUM LISTENING QUESTIONS:
{curriculum_block}
"""

    msg = _llm().invoke([
        {"role": "system", "content": prompt},
        {"role": "user", "content": user_content},
    ])
    raw = _json_safe(msg.content)
    activity = _normalize_activity(raw, unit_id, source_hash, grade)
    save_listening(unit_id, activity)
    return activity


def listening_question_to_quiz(question: Dict[str, Any], index: int, total: int) -> Dict[str, Any]:
    opts = list(question.get("options") or [])
    return {
        "type": "listening",
        "question": question.get("question") or "",
        "options": opts,
        "correct_answer": question.get("correct_answer") or "",
        "expected_points": [question.get("correct_answer") or ""],
        "explanation": question.get("explanation") or "",
        "skill": question.get("skill") or "understanding",
        "listening_question_id": question.get("id") or f"q{index + 1}",
        "listening_question_index": index,
        "listening_question_total": total,
    }


def format_listening_teacher_text(activity: Dict[str, Any]) -> str:
    """Display + TTS text — transcript is the exact narration."""
    title = activity.get("title") or "Listening Story"
    transcript = activity.get("transcript") or activity.get("narration_text") or ""
    return (
        f"**Listening Activity: {title}**\n\n"
        "Listen carefully to the story. Every answer to the questions comes from this story.\n\n"
        f"{transcript}\n\n"
        "When you have finished listening, answer the comprehension questions below."
    )
