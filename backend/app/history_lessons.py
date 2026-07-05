"""
Canonical History G6 (Ancient Egypt) lesson catalog, validation, and AI scope rules.

Single source of truth: backend/data/books/history_g6/lessons.json
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

BOOKS_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "books")

GENERIC_TITLE_PATTERNS = re.compile(
    r"(?i)\b(introduction|overview|welcome|getting started|unit \d+|lesson \d+|chapter \d+)\b"
)

BANNED_SCRIPT_PHRASES = [
    "let's learn something interesting today",
]

FORBIDDEN_PART2_OPENINGS = [
    "today we are going to learn",
    "today we're going to learn",
    "let's learn something interesting today",
    "welcome back",
    "the ancient egyptians lived near the nile",
    "the ancient egyptians lived along the nile",
    "ancient egypt was",
    "hello, young learners",
    "hello young learners",
]

FORBIDDEN_PART2_OPENING_RE = re.compile(
    r"(?im)^\s*(?:today we(?:'re| are) going to learn|let'?s learn something|"
    r"welcome back|hello,? young learners|the ancient egyptians lived|ancient egypt was\b)"
)

BANNED_TEACHER_HEADINGS = re.compile(
    r"(?im)^\s*(?:discussion questions?|class activities?|your turn|activities?|"
    r"comprehension questions?|think and discuss|exercises?|worksheet)\s*:?\s*$"
)

QUESTION_SENTENCE = re.compile(
    r"(?i)^\s*(?:what|why|how|when|where|who|which|can you|could you|do you|did you|"
    r"are you|is there|were there|would you|shall we|let'?s discuss)\b.*\?\s*$"
)

MIN_TEACHER_WORDS = 600
MIN_TEACHER_PARAGRAPHS = 5
MIN_TEXTBOOK_FACTS = 3
MIN_TEACHER_PART_WORDS = 280
MIN_TEACHER_PART_PARAGRAPHS = 3
MIN_TEACHER_PART_FACTS = 2
MIN_SCRIPT_WORDS = 20
MAX_SCRIPT_WORDS = 120
MIN_EXPLANATION_RATIO = 0.80
MAX_PART_TOPIC_OVERLAP = 0.10
MAX_DISCUSSION_QUESTIONS = 2
MAX_REFLECTION_QUESTIONS = 1

HISTORY_SCOPE_RULES = """
You are Jassmine, an enthusiastic history teacher speaking naturally to children aged 10-12.
You may ONLY explain topics listed in allowedTopics for THIS lesson.
Use ONLY retrieved textbook chunks that match this lesson's allowedTopics.
Do NOT mention topics owned by another lesson.

TEACHING STYLE: conversational storytelling — warm, curious, face-to-face — NOT textbook narration.
Mention the lesson topic once at the start, then use natural references ("this civilization", "this idea").
At least 80% of sentences must explain concepts, not ask questions.
Do not create "Discussion Questions" headings or copy workbook question lists.
Do not use "What do you think so far?" — ever.
Ask at most ONE thoughtful question per major concept, and no more than 2 in the entire lesson.
Do not use section titles like "1. Hook" or "2. Explanation".
Do not repeat the grade, subject name, or lesson title.
""".strip()


def _lessons_path(book_id: str) -> str:
    return os.path.join(BOOKS_ROOT, book_id, "lessons.json")


def _manifest_path(book_id: str) -> str:
    return os.path.join(BOOKS_ROOT, book_id, "manifest.json")


def load_lessons_catalog(book_id: str = "history_g6") -> Dict[str, Any]:
    path = _lessons_path(book_id)
    if not os.path.exists(path):
        raise FileNotFoundError(f"No lessons catalog for book: {book_id}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    lessons = data.get("lessons") or []
    _attach_forbidden_topics(lessons)
    data["lessons"] = lessons
    return data


def _attach_forbidden_topics(lessons: List[Dict[str, Any]]) -> None:
    all_by_lesson: List[List[str]] = [list(l.get("allowedTopics") or []) for l in lessons]
    for i, lesson in enumerate(lessons):
        forbidden: List[str] = []
        for j, topics in enumerate(all_by_lesson):
            if j != i:
                forbidden.extend(topics)
        lesson["forbiddenTopics"] = forbidden


def get_lesson(book_id: str, lesson_number: int) -> Optional[Dict[str, Any]]:
    catalog = load_lessons_catalog(book_id)
    for lesson in catalog.get("lessons") or []:
        if int(lesson.get("lessonNumber", 0)) == int(lesson_number):
            return lesson
    return None


def get_lesson_by_unit_id(unit_id: str, book_id: str = "history_g6") -> Optional[Dict[str, Any]]:
    short = unit_id.split(":")[-1] if ":" in unit_id else unit_id
    catalog = load_lessons_catalog(book_id)
    for lesson in catalog.get("lessons") or []:
        if lesson.get("unit_id") == short or lesson.get("id") == unit_id:
            return lesson
    return None


def lesson_number_from_unit_id(unit_id: str) -> int:
    m = re.search(r"unit_(\d+)", unit_id or "", re.IGNORECASE)
    return int(m.group(1)) if m else 0


def get_lesson_parts(lesson: Dict[str, Any]) -> List[Dict[str, Any]]:
    """This History book has NO lesson parts: one lesson == one part.

    Each lesson is a single unit that owns ALL of its allowedTopics. We never
    split a lesson into Part 1 / Part 2 — there is one script, one video and
    one quiz per lesson.
    """
    topics = list(lesson.get("allowedTopics") or [])
    return [{
        "partNumber": 1,
        "ownedTopics": topics,
        "allowedTopics": topics,
        "title": lesson.get("title") or "Lesson",
    }]


def build_topic_ownership_map(lesson: Dict[str, Any]) -> Dict[int, List[str]]:
    """Map part_index -> ownedTopics. Each topic appears in exactly one part."""
    return {i: list(p.get("ownedTopics") or p.get("allowedTopics") or [])
            for i, p in enumerate(get_lesson_parts(lesson))}


def get_owned_topics(lesson: Dict[str, Any], part_index: int) -> List[str]:
    """Topics this part exclusively owns — the ONLY topics the AI may explain."""
    parts = get_lesson_parts(lesson)
    idx = max(0, min(int(part_index), len(parts) - 1))
    return list(parts[idx].get("ownedTopics") or parts[idx].get("allowedTopics") or [])


def get_other_part_topics(lesson: Dict[str, Any], part_index: int) -> List[str]:
    """Topics owned by OTHER parts in the same lesson (forbidden in this part)."""
    owned: List[str] = []
    for i, part in enumerate(get_lesson_parts(lesson)):
        if i != int(part_index):
            owned.extend(part.get("ownedTopics") or part.get("allowedTopics") or [])
    return owned


def part_count(lesson: Dict[str, Any]) -> int:
    return len(get_lesson_parts(lesson))


def already_covered_topics(lesson: Dict[str, Any], part_index: int) -> List[str]:
    """Internal tracking only — NOT passed to AI prompts."""
    covered: List[str] = []
    for part in get_lesson_parts(lesson)[: max(0, int(part_index))]:
        covered.extend(part.get("ownedTopics") or part.get("allowedTopics") or [])
    return covered


def get_part_allowed_topics(lesson: Dict[str, Any], part_index: int) -> List[str]:
    return get_owned_topics(lesson, part_index)


def lesson_part_id(lesson: Dict[str, Any], part_index: int) -> str:
    """Canonical part id, e.g. history_g6:unit_01:part_1."""
    lid = lesson.get("id") or f"history_g6:{lesson.get('unit_id', '')}"
    part_num = int(part_index) + 1
    return f"{lid}:part_{part_num}"


def split_history_lesson_into_parts(lesson: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return HistoryLessonPart records with exclusive ownedTopics."""
    out: List[Dict[str, Any]] = []
    for i, part in enumerate(get_lesson_parts(lesson)):
        owned = list(part.get("ownedTopics") or part.get("allowedTopics") or [])
        pid = lesson_part_id(lesson, i)
        out.append({
            "id": pid,
            "lessonId": lesson.get("id"),
            "partNumber": int(part.get("partNumber") or i + 1),
            "title": part.get("title") or f"Part {i + 1}",
            "ownedTopics": owned,
            "keyTopics": owned,
            "allowedTopics": owned,
        })
    return out


NON_TEACHABLE_HISTORY_RE = re.compile(
    r"(?im)^\s*(?:discussion questions?|comprehension questions?|class activities?|"
    r"your turn|activities?|think and discuss|exercises?|worksheet|research project|"
    r"timeline task|artefact task|congratulations|cover page|project instructions?)\b"
)


def is_non_teachable_history_content(text: str) -> bool:
    """True for worksheets, activities, and other non-explanation book content."""
    body = (text or "").strip()
    if len(body) < 30:
        return True
    if NON_TEACHABLE_HISTORY_RE.search(body):
        return True
    lower = body.lower()
    if lower.startswith("worksheet") or lower.startswith("activity"):
        return True
    return False


def create_history_embedding_chunk_metadata(
    *,
    book_id: str,
    lesson: Dict[str, Any],
    part_index: int,
    chunk_text: str,
    page_number: int,
    chunk_index: int,
    section_title: str = "",
) -> Dict[str, Any]:
    """Build metadata for one HistoryEmbeddingChunk."""
    lid = lesson.get("id") or f"{book_id}:{lesson.get('unit_id', '')}"
    pid = lesson_part_id(lesson, part_index)
    part_topics = get_owned_topics(lesson, part_index)
    return {
        "subject": "history",
        "book_id": book_id,
        "bookId": book_id,
        "unitId": lid,
        "unit_id": lid,
        "lesson_id": lid,
        "lessonId": lid,
        "lesson_part_id": pid,
        "lessonPartId": pid,
        "lesson_number": int(lesson.get("lessonNumber", 0)),
        "lesson_title": lesson.get("title") or "",
        "sectionTitle": section_title or lesson.get("sourceSectionTitle") or lesson.get("title") or "",
        "keyTopics": part_topics[:8],
        "pdf_page": page_number,
        "book_page": page_number,
        "chunk_index": chunk_index,
    }


def _covered_overlap_ratio(text: str, covered_topics: List[str]) -> float:
    if not covered_topics:
        return 0.0
    hits = sum(1 for topic in covered_topics if _topic_in_text(topic, text))
    return hits / len(covered_topics)


def _first_paragraph(text: str) -> str:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", (text or "").strip()) if b.strip()]
    return blocks[0] if blocks else (text or "").strip()[:400]


def _has_forbidden_continuation_opening(text: str) -> Optional[str]:
    opening = _first_paragraph(text).lower()
    for phrase in FORBIDDEN_PART2_OPENINGS:
        if phrase in opening:
            return phrase
    if FORBIDDEN_PART2_OPENING_RE.search(_first_paragraph(text)):
        return "forbidden introduction-style opening"
    return None


def build_part_scope_block(
    lesson: Dict[str, Any],
    part_index: int,
    *,
    mode: str = "teacher",
) -> str:
    """Scope block for ONE part only — passes ownedTopics, never full lesson or prior parts."""
    parts = get_lesson_parts(lesson)
    idx = max(0, min(int(part_index), len(parts) - 1))
    part = parts[idx]
    part_num = int(part.get("partNumber") or idx + 1)
    owned = get_owned_topics(lesson, idx)
    forbidden_other_parts = get_other_part_topics(lesson, idx)
    forbidden_cross_lesson = list(lesson.get("forbiddenTopics") or [])

    owned_lines = "\n".join(f"- {t}" for t in owned) or "- (none)"
    forbidden_lines = "\n".join(
        f"- {t}" for t in (forbidden_other_parts + forbidden_cross_lesson)[:50]
    ) or "- (none)"

    opening_rule = (
        "You MAY start with a brief hook about today's ownedTopics."
        if idx == 0
        else (
            f"Start DIRECTLY with the first ownedTopic for Part {part_num}. "
            "Do NOT re-introduce Egypt, the Nile, or any topic from another part."
        )
    )

    word_hint = (
        f"Target about {MIN_TEACHER_PART_WORDS}–400 words."
        if mode == "teacher"
        else f"Target {MIN_SCRIPT_WORDS}–35 spoken words (one key concept for a short video)."
    )

    return f"""{HISTORY_SCOPE_RULES}

LESSON: {lesson.get('title', '')}
PART: {part_num} of {len(parts)}

ownedTopics (you may ONLY explain these — every sentence must be about one of these):
{owned_lines}

FORBIDDEN (owned by other parts or other lessons — do NOT mention even briefly):
{forbidden_lines}

OPENING: {opening_rule}

{word_hint}
"""


def build_teaching_scope_block(lesson: Dict[str, Any], part_index: Optional[int] = None) -> str:
    if part_index is not None:
        return build_part_scope_block(lesson, int(part_index), mode="teacher")
    allowed = lesson.get("allowedTopics") or []
    forbidden = lesson.get("forbiddenTopics") or []
    allowed_lines = "\n".join(f"- {t}" for t in allowed)
    forbidden_lines = "\n".join(f"- {t}" for t in forbidden[:40])
    if len(forbidden) > 40:
        forbidden_lines += f"\n- ... and {len(forbidden) - 40} more topics from other lessons"
    return f"""{HISTORY_SCOPE_RULES}

CURRENT LESSON: {lesson.get('title', '')}
LESSON ID: {lesson.get('id', '')}

ALLOWED TOPICS (teach ONLY these):
{allowed_lines}

FORBIDDEN TOPICS (do NOT mention — other lessons):
{forbidden_lines}
"""


def build_script_prompt_context(
    lesson: Dict[str, Any],
    book_excerpt: str = "",
    *,
    part_index: int = 0,
    previous_scripts: Optional[List[str]] = None,
) -> str:
    """Build prompt for ONE part only — no previous scripts or full-lesson context."""
    scope = build_part_scope_block(lesson, part_index, mode="video")
    excerpt = (book_excerpt or "").strip()
    if len(excerpt) > 5000:
        excerpt = excerpt[:5000] + "\n…"
    return f"""{scope}

TEXTBOOK EXCERPT FOR THIS PART ONLY (ignore anything outside ownedTopics):
{excerpt or '(use ownedTopics only — do not invent facts)'}
"""


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _topic_in_text(topic: str, text: str) -> bool:
    t = _norm_text(topic)
    if not t or len(t) < 3:
        return False
    body = _norm_text(text)
    if t in body:
        return True
    words = [w for w in re.split(r"[^\w]+", t) if len(w) > 3]
    if len(words) >= 2:
        hits = sum(1 for w in words if w in body)
        return hits >= max(2, len(words) - 1)
    return False


def validate_lesson_catalog(book_id: str = "history_g6") -> Dict[str, Any]:
    errors: List[str] = []
    catalog = load_lessons_catalog(book_id)
    lessons: List[Dict[str, Any]] = catalog.get("lessons") or []

    if len(lessons) != 6:
        errors.append(f"Expected exactly 6 lessons, found {len(lessons)}")

    titles = [l.get("title") or "" for l in lessons]
    if len(titles) != len(set(titles)):
        errors.append("Duplicate lesson titles in catalog")

    all_topics: List[Tuple[str, str, str]] = []
    video_files: Dict[str, str] = {}

    for lesson in lessons:
        ln = lesson.get("lessonNumber")
        title = lesson.get("title") or ""
        lid = lesson.get("id") or ""

        if GENERIC_TITLE_PATTERNS.search(title) and "ancient egypt" not in title.lower():
            errors.append(f"Lesson {ln} has generic title: {title!r}")

        if not lesson.get("allowedTopics"):
            errors.append(f"Lesson {ln} missing allowedTopics")

        parts = get_lesson_parts(lesson)
        part_topics: List[str] = []
        for part in parts:
            part_topics.extend(part.get("allowedTopics") or [])
        lesson_topics = set(_norm_text(t) for t in (lesson.get("allowedTopics") or []))
        part_topics_norm = set(_norm_text(t) for t in part_topics)
        if lesson_topics and part_topics_norm and lesson_topics != part_topics_norm:
            errors.append(f"Lesson {ln} videoParts topics do not cover allowedTopics")

        # Parts must not share topics within the same lesson.
        seen_part_topics: Dict[str, int] = {}
        for part in parts:
            pn = int(part.get("partNumber") or 0)
            for topic in part.get("allowedTopics") or []:
                key = _norm_text(topic)
                if key in seen_part_topics:
                    errors.append(
                        f"Lesson {ln} Part {pn} repeats topic {topic!r} "
                        f"(already in Part {seen_part_topics[key]})"
                    )
                else:
                    seen_part_topics[key] = pn

        for topic in lesson.get("allowedTopics") or []:
            all_topics.append((topic, title, lid))

        vf = lesson.get("videoFilename")
        vt = lesson.get("videoType")
        if vf and not vt:
            errors.append(f"Lesson {ln} has videoFilename but missing videoType")
        if vt == "lessonVideo" and not vf:
            errors.append(f"Lesson {ln} marked lessonVideo but has no videoFilename")
        if vf:
            if vf in video_files:
                errors.append(f"Video {vf!r} assigned to both {video_files[vf]} and {lid}")
            else:
                video_files[vf] = lid

    seen: Dict[str, str] = {}
    for topic, _title, lid in all_topics:
        key = _norm_text(topic)
        if key in seen and seen[key] != lid:
            errors.append(f"Topic {topic!r} appears in both {seen[key]} and {lid}")
        seen[key] = lid

    return {"valid": len(errors) == 0, "errors": errors, "lesson_count": len(lessons)}


def validate_publish_lesson(lesson: Dict[str, Any], book_id: str = "history_g6") -> Dict[str, Any]:
    """Pre-publish checks for one lesson."""
    errors: List[str] = []
    lid = lesson.get("id") or ""
    title = lesson.get("title") or ""

    if not title:
        errors.append("Missing lesson title")
    if not lesson.get("allowedTopics"):
        errors.append("Missing allowedTopics")
    if not lesson.get("start_page"):
        errors.append("Missing start_page")

    catalog = validate_lesson_catalog(book_id)
    for e in catalog.get("errors") or []:
        if lid and lid in e:
            errors.append(e)

    vf = lesson.get("videoFilename")
    if vf:
        v = validate_video_assignment(lid or lesson.get("unit_id", ""), vf, book_id)
        errors.extend(v.get("errors") or [])

    return {"valid": len(errors) == 0, "errors": errors, "lesson_id": lid, "title": title}


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def _split_paragraphs(text: str) -> List[str]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text or "") if b.strip()]
    if len(blocks) >= MIN_TEACHER_PARAGRAPHS:
        return blocks
    lines = [ln.strip() for ln in (text or "").split("\n") if len(ln.strip()) > 40]
    return lines if len(lines) >= MIN_TEACHER_PARAGRAPHS else blocks


def _is_question_sentence(sentence: str) -> bool:
    s = sentence.strip()
    if not s:
        return False
    if s.endswith("?"):
        return True
    if QUESTION_SENTENCE.match(s):
        return True
    if s.lower().startswith("discussion question"):
        return True
    return False


def _count_topic_facts(text: str, allowed_topics: List[str]) -> int:
    return sum(1 for topic in (allowed_topics or []) if _topic_in_text(topic, text))


def validate_history_part(
    text: str,
    lesson: Dict[str, Any],
    part_index: int,
    *,
    mode: str = "teacher",
    previous_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    errors: List[str] = []
    body = (text or "").strip()
    idx = max(0, int(part_index))
    owned = get_owned_topics(lesson, idx)
    forbidden_other_parts = get_other_part_topics(lesson, idx)
    parts = get_lesson_parts(lesson)
    part_num = int(parts[idx].get("partNumber") or idx + 1) if parts else idx + 1

    if not body:
        errors.append("Content is empty")

    word_count = len(body.split())
    if mode == "video":
        if word_count < MIN_SCRIPT_WORDS:
            errors.append(f"Too short: {word_count} words (minimum {MIN_SCRIPT_WORDS})")
        if word_count > MAX_SCRIPT_WORDS:
            errors.append(f"Too long: {word_count} words (maximum {MAX_SCRIPT_WORDS})")
        min_facts = 1
        min_paras = 1
    else:
        if word_count < MIN_TEACHER_PART_WORDS:
            errors.append(f"Too short: {word_count} words (minimum {MIN_TEACHER_PART_WORDS})")
        min_facts = min(MIN_TEACHER_PART_FACTS, len(owned)) if owned else MIN_TEACHER_PART_FACTS
        min_paras = MIN_TEACHER_PART_PARAGRAPHS

    paragraphs = _split_paragraphs(body)
    if mode == "teacher" and len(paragraphs) < min_paras:
        errors.append(f"Too few paragraphs: {len(paragraphs)} (minimum {min_paras})")

    facts = _count_topic_facts(body, owned)
    if owned and facts < min_facts:
        errors.append(
            f"Too few Part {part_num} ownedTopics covered: {facts} (minimum {min_facts}). "
            f"Teach: {', '.join(owned[:4])}…"
        )

    # STRICT: zero tolerance for topics owned by another part in the same lesson.
    for topic in forbidden_other_parts:
        if _topic_in_text(topic, body):
            errors.append(f"Contains topic owned by another part: {topic!r}")

    if idx > 0:
        bad_open = _has_forbidden_continuation_opening(body)
        if bad_open:
            errors.append(
                f"Part {part_num} must NOT start like a new lesson (found: {bad_open!r}). "
                "Begin directly with this part's ownedTopics."
            )

    overlap = _covered_overlap_ratio(body, forbidden_other_parts)
    if forbidden_other_parts and overlap > 0:
        errors.append(
            f"Repeats {overlap:.0%} of other-part ownedTopics. "
            "Teach ONLY this part's ownedTopics."
        )

    if BANNED_TEACHER_HEADINGS.search(body):
        errors.append('Contains forbidden heading (e.g. "Discussion Questions")')

    lower = body.lower()
    if "discussion questions" in lower:
        errors.append('Contains "Discussion Questions" section')
    if "what do you think so far" in lower:
        errors.append('Contains banned phrase "What do you think so far?"')

    # Cross-lesson forbidden topics
    for forbidden in lesson.get("forbiddenTopics") or []:
        if _topic_in_text(forbidden, body):
            errors.append(f"Mentions forbidden topic from another lesson: {forbidden!r}")

    for phrase in BANNED_SCRIPT_PHRASES:
        if phrase in lower:
            errors.append(f"Banned phrase: {phrase!r}")

    explanation_ratio = 1.0
    if mode == "teacher":
        sentences = _split_sentences(body)
        question_sentences = [s for s in sentences if _is_question_sentence(s)]
        total = len(sentences) or 1
        explanation_ratio = (total - len(question_sentences)) / total
        if explanation_ratio < MIN_EXPLANATION_RATIO:
            errors.append(
                f"Explanation ratio too low: {explanation_ratio:.0%} "
                f"(minimum {MIN_EXPLANATION_RATIO:.0%})"
            )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "word_count": word_count,
        "paragraph_count": len(paragraphs),
        "topic_facts": facts,
        "overlap_ratio": round(overlap, 3),
        "explanation_ratio": round(explanation_ratio, 3),
        "partNumber": part_num,
        "part_index": idx,
    }


def validate_teacher_lesson(
    text: str,
    lesson: Dict[str, Any],
    part_index: Optional[int] = None,
) -> Dict[str, Any]:
    if part_index is not None:
        return validate_history_part(text, lesson, int(part_index), mode="teacher")

    errors: List[str] = []
    body = (text or "").strip()

    if not body:
        errors.append("Lesson text is empty")

    word_count = len(body.split())
    if word_count < MIN_TEACHER_WORDS:
        errors.append(f"Too short: {word_count} words (minimum {MIN_TEACHER_WORDS})")

    paragraphs = _split_paragraphs(body)
    if len(paragraphs) < MIN_TEACHER_PARAGRAPHS:
        errors.append(f"Too few paragraphs: {len(paragraphs)} (minimum {MIN_TEACHER_PARAGRAPHS})")

    facts = _count_topic_facts(body, lesson.get("allowedTopics") or [])
    if facts < MIN_TEXTBOOK_FACTS:
        errors.append(f"Too few textbook topics covered: {facts} (minimum {MIN_TEXTBOOK_FACTS})")

    if BANNED_TEACHER_HEADINGS.search(body):
        errors.append('Contains forbidden heading (e.g. "Discussion Questions")')

    lower = body.lower()
    if "discussion questions" in lower:
        errors.append('Contains "Discussion Questions" section')
    if "what do you think so far" in lower:
        errors.append('Contains banned phrase "What do you think so far?"')
    if lower.count("what do you think?") > MAX_DISCUSSION_QUESTIONS:
        errors.append('Too many "What do you think?" prompts')

    sentences = _split_sentences(body)
    question_sentences = [s for s in sentences if _is_question_sentence(s)]
    total = len(sentences) or 1
    explanation_ratio = (total - len(question_sentences)) / total
    if explanation_ratio < MIN_EXPLANATION_RATIO:
        errors.append(
            f"Explanation ratio too low: {explanation_ratio:.0%} "
            f"(minimum {MIN_EXPLANATION_RATIO:.0%}). Teach more — fewer questions."
        )

    reflection_q = sum(
        1 for s in question_sentences
        if "reflect" in s.lower() or "think about" in s.lower()
    )
    if reflection_q > MAX_REFLECTION_QUESTIONS:
        errors.append(f"Too many reflection questions: {reflection_q} (max {MAX_REFLECTION_QUESTIONS})")

    for forbidden in lesson.get("forbiddenTopics") or []:
        if _topic_in_text(forbidden, body):
            errors.append(f"Lesson mentions forbidden topic: {forbidden!r}")

    for phrase in BANNED_SCRIPT_PHRASES:
        if phrase in lower:
            errors.append(f"Banned phrase: {phrase!r}")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "word_count": word_count,
        "paragraph_count": len(paragraphs),
        "topic_facts": facts,
        "explanation_ratio": round(explanation_ratio, 3),
        "question_count": len(question_sentences),
    }


def validate_script(
    script: str,
    lesson: Dict[str, Any],
    *,
    part_index: int = 0,
    previous_scripts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return validate_history_part(
        script,
        lesson,
        part_index,
        mode="video",
        previous_texts=previous_scripts,
    )


def validate_video_assignment(
    unit_id: str,
    video_filename: str,
    book_id: str = "history_g6",
) -> Dict[str, Any]:
    errors: List[str] = []
    lesson = get_lesson_by_unit_id(unit_id, book_id)
    if not lesson:
        errors.append(f"Unknown unit_id: {unit_id}")
        return {"valid": False, "errors": errors}

    expected = lesson.get("videoFilename")
    if expected and video_filename != expected:
        errors.append(
            f"Video {video_filename!r} assigned to {unit_id} but catalog expects {expected!r}"
        )
    if not expected and video_filename:
        errors.append(
            f"Video {video_filename!r} should not be assigned to {lesson.get('title')!r}"
        )

    catalog = load_lessons_catalog(book_id)
    for other in catalog.get("lessons") or []:
        if other.get("id") == lesson.get("id"):
            continue
        if other.get("videoFilename") == video_filename and video_filename:
            errors.append(
                f"Video {video_filename!r} already assigned to lesson {other.get('lessonNumber')}"
            )

    return {"valid": len(errors) == 0, "errors": errors}


def normalize_lesson_id(unit_or_lesson_id: str, book_id: str = "history_g6") -> str:
    """Return canonical lesson id (shared with history_rag)."""
    raw = (unit_or_lesson_id or "").strip()
    if not raw:
        return raw
    if raw.count(":") >= 2 and "part_" in raw:
        return ":".join(raw.split(":")[:2])
    if ":" in raw:
        return raw
    short = raw.split("/")[-1]
    if short.startswith("unit_"):
        return f"{book_id}:{short}"
    return f"{book_id}:{short}"


def validate_history_lesson_ownership(book_id: str = "history_g6") -> Dict[str, Any]:
    """Validate catalog-level topic ownership across all History lessons."""
    return validate_lesson_catalog(book_id)


def validate_history_rag_retrieval(
    chunks: List[Dict[str, Any]],
    lesson_id: str,
    lesson_part_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Ensure every retrieved chunk belongs to the requested History lesson (and part)."""
    errors: List[str] = []
    lid = normalize_lesson_id(lesson_id)
    if not chunks:
        errors.append(
            f"No RAG chunks found for lesson {lid}"
            + (f" part {lesson_part_id}" if lesson_part_id else "")
        )
        return {"valid": False, "errors": errors, "chunk_count": 0}

    for i, chunk in enumerate(chunks):
        meta = chunk.get("meta") or {}
        chunk_lid = meta.get("lesson_id") or meta.get("lessonId") or meta.get("unit_id")
        if normalize_lesson_id(str(chunk_lid or "")) != lid:
            errors.append(f"Chunk {i} has lesson_id {chunk_lid!r}, expected {lid!r}")
        if lesson_part_id:
            cpid = meta.get("lesson_part_id") or meta.get("lessonPartId")
            if cpid and cpid != lesson_part_id:
                errors.append(
                    f"Chunk {i} has lesson_part_id {cpid!r}, expected {lesson_part_id!r}"
                )
    return {"valid": len(errors) == 0, "errors": errors, "chunk_count": len(chunks)}


def validate_history_script(
    script: str,
    lesson: Dict[str, Any],
    *,
    part_index: int = 0,
    previous_scripts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return validate_script(
        script, lesson, part_index=part_index, previous_scripts=previous_scripts
    )


def build_history_video_record(
    lesson: Dict[str, Any],
    *,
    part_index: Optional[int] = None,
    script: str = "",
    video_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a HistoryVideo mapping for one lesson or lesson part."""
    lid = lesson.get("id") or ""
    parts = get_lesson_parts(lesson)
    if part_index is not None:
        idx = max(0, min(int(part_index), len(parts) - 1))
        part = parts[idx]
        pid = lesson_part_id(lesson, idx)
        return {
            "id": f"{pid}:video",
            "unitId": lid,
            "lessonId": lid,
            "lessonPartId": pid,
            "title": part.get("title") or lesson.get("title"),
            "script": script,
            "videoUrl": video_url,
            "metaJsonUrl": (lesson.get("videoFilename") or "").replace(".mp4", ".meta.json") or None,
            "coveredTopics": list(part.get("allowedTopics") or []),
            "videoType": "lessonPartVideo",
        }
    vf = lesson.get("videoFilename")
    return {
        "id": f"{lid}:video",
        "unitId": lid,
        "lessonId": lid,
        "lessonPartId": None,
        "title": lesson.get("title"),
        "script": script,
        "videoUrl": video_url,
        "metaJsonUrl": vf.replace(".mp4", ".meta.json") if vf else None,
        "coveredTopics": list(lesson.get("allowedTopics") or []),
        "videoType": lesson.get("videoType") or "lessonVideo",
    }


def validate_history_video_mapping(
    video: Dict[str, Any],
    lesson_id: str,
    lesson_part_id: Optional[str] = None,
    book_id: str = "history_g6",
) -> Dict[str, Any]:
    errors: List[str] = []
    lesson = get_lesson_by_unit_id(lesson_id, book_id)
    if not lesson:
        errors.append(f"Unknown lesson: {lesson_id}")
        return {"valid": False, "errors": errors}

    lid = lesson.get("id") or lesson_id
    if video.get("lessonId") and video.get("lessonId") != lid:
        errors.append(f"Video lessonId {video.get('lessonId')!r} != {lid!r}")

    if lesson_part_id:
        if video.get("lessonPartId") != lesson_part_id:
            errors.append(
                f"Video lessonPartId {video.get('lessonPartId')!r} != {lesson_part_id!r}"
            )
    else:
        expected = lesson.get("videoFilename")
        url = video.get("videoUrl") or video.get("videoFilename") or ""
        if expected and expected not in str(url):
            v = validate_video_assignment(lesson_id, expected, book_id)
            errors.extend(v.get("errors") or [])

    return {"valid": len(errors) == 0, "errors": errors}


def lessons_for_ui(book_id: str = "history_g6") -> List[Dict[str, Any]]:
    catalog = load_lessons_catalog(book_id)
    out: List[Dict[str, Any]] = []
    for lesson in catalog.get("lessons") or []:
        out.append({
            "id": lesson.get("lessonNumber"),
            "name": lesson.get("title"),
            "description": lesson.get("shortDescription"),
            "unit_id": lesson.get("unit_id"),
            "full_unit_id": lesson.get("id"),
            "videoFilename": lesson.get("videoFilename"),
            "videoType": lesson.get("videoType"),
        })
    return out


def get_lessons_api_response(book_id: str = "history_g6") -> Dict[str, Any]:
    catalog = load_lessons_catalog(book_id)
    validation = validate_lesson_catalog(book_id)
    lessons_out = []
    for lesson in catalog.get("lessons") or []:
        vf = lesson.get("videoFilename")
        parts = get_lesson_parts(lesson)
        part_videos = [
            build_history_video_record(lesson, part_index=i)
            for i in range(len(parts))
        ]
        lessons_out.append({
            "id": lesson.get("id"),
            "lessonNumber": lesson.get("lessonNumber"),
            "unit_id": lesson.get("unit_id"),
            "subject": catalog.get("subject", "history"),
            "grade": catalog.get("grade", 6),
            "unit": catalog.get("unit", "Ancient Egypt"),
            "title": lesson.get("title"),
            "shortDescription": lesson.get("shortDescription"),
            "sourceSectionTitle": lesson.get("sourceSectionTitle"),
            "allowedTopics": lesson.get("allowedTopics"),
            "forbiddenTopics": lesson.get("forbiddenTopics"),
            "videoParts": parts,
            "partCount": len(parts),
            "parts": split_history_lesson_into_parts(lesson),
            "start_page": lesson.get("start_page"),
            "end_page": lesson.get("end_page"),
            "videoFilename": vf,
            "videoType": lesson.get("videoType"),
            "videoUrl": None,
            "metaJsonUrl": vf.replace(".mp4", ".meta.json") if vf else None,
            "historyVideo": build_history_video_record(lesson),
            "partVideos": part_videos,
        })
    return {
        "book_id": book_id,
        "subject": catalog.get("subject"),
        "grade": catalog.get("grade"),
        "unit": catalog.get("unit"),
        "lessons": lessons_out,
        "validation": validation,
    }


def sync_manifest_from_catalog(book_id: str = "history_g6") -> None:
    catalog = load_lessons_catalog(book_id)
    manifest_path = _manifest_path(book_id)
    if not os.path.exists(manifest_path):
        return
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    lesson_by_unit = {l["unit_id"]: l for l in catalog.get("lessons") or []}
    for unit in manifest.get("units") or []:
        uid = unit.get("unit_id")
        lesson = lesson_by_unit.get(uid)
        if not lesson:
            continue
        unit["title"] = lesson["title"]
        unit["description"] = lesson["shortDescription"]
        unit["contentStartSection"] = lesson["title"]
        unit["contentEndSection"] = lesson["title"]
        unit["start_page"] = lesson.get("start_page", unit.get("start_page"))
        unit["end_page"] = lesson.get("end_page", unit.get("end_page"))
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
