"""Read stored lesson content for admin preview (no regeneration)."""

from __future__ import annotations

import glob
import os
from typing import Any, Dict, List, Optional

from .chapters_service import get_unit_content
from .listening_generator import collect_vocabulary_keywords
from .listening_store import load_listening
from .portal_curriculum import find_lesson_meta
from .progress_store import load_unit_progress
from .session_engine import progress_book_id
from .storage import DATA_DIR, load_json
from .unit_plan_store import load_unit_plan
from .active_session_store import load_active_session


def _safe_chapter(chapter_id: str) -> str:
    return chapter_id.replace(":", "_")


def _chapter_matches(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    return a.replace(":", "_") == b.replace(":", "_")


def _find_any_unit_plan(chapter_id: str, student_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    from .canonical_plan_store import load_canonical_unit_plan
    from .book_plan_service import load_approved_canonical_unit_plan
    from .unit_detection import full_unit_id, normalize_manifest_unit_id

    book_id = chapter_id.split(":")[0] if ":" in chapter_id else chapter_id
    candidates = [chapter_id]
    if ":" in chapter_id:
        candidates.append(normalize_manifest_unit_id(chapter_id, book_id))
        candidates.append(full_unit_id(book_id, normalize_manifest_unit_id(chapter_id, book_id)))
    else:
        candidates.append(full_unit_id(book_id, chapter_id))

    seen: set = set()
    for key in candidates:
        if not key or key in seen:
            continue
        seen.add(key)
        plan = load_approved_canonical_unit_plan(book_id, key)
        if plan and plan.get("items"):
            return plan

    for key in candidates:
        if not key or key in seen:
            continue
        plan = load_canonical_unit_plan(book_id, key)
        if plan and plan.get("items"):
            return plan

    if student_id:
        plan = load_unit_plan(student_id, chapter_id)
        if plan:
            return plan
    pattern = os.path.join(DATA_DIR, f"unitplan_*_{_safe_chapter(chapter_id)}.json")
    matches = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    for path in matches:
        try:
            with open(path, encoding="utf-8") as f:
                import json
                return json.load(f)
        except Exception:
            continue
    return None


def _find_progress_samples(chapter_id: str, student_id: Optional[str] = None) -> List[Dict[str, Any]]:
    safe = _safe_chapter(chapter_id)
    pattern = os.path.join(DATA_DIR, f"progress_*_{safe}.json")
    if student_id:
        direct = load_unit_progress(student_id, chapter_id)
        if direct:
            return [{"student_id": student_id, "progress": direct}]
    out: List[Dict[str, Any]] = []
    for path in sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)[:5]:
        fname = os.path.basename(path)
        sid = fname.replace("progress_", "").replace(f"_{safe}.json", "")
        try:
            with open(path, encoding="utf-8") as f:
                import json
                out.append({"student_id": sid, "progress": json.load(f)})
        except Exception:
            continue
    return out


def _resolve_stored_session(chapter_id: str, student_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    sess = load_active_session()
    if not sess:
        return None
    sess_chapter = sess.get("graph_chapter_id") or sess.get("chapter_id")
    if not _chapter_matches(sess_chapter, chapter_id):
        return None
    if student_id and sess.get("student_id") != student_id:
        return None
    return sess


def _load_listening_activity(chapter_id: str, session: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    if session and session.get("listening"):
        return session["listening"]
    candidates = [chapter_id]
    if ":" in chapter_id:
        short = chapter_id.split(":")[-1]
        book = chapter_id.split(":")[0]
        candidates.extend([short, f"english_g6:{short}", f"{book}:{short}"])
    for cid in candidates:
        data = load_listening(cid)
        if data:
            return data
    return None


def _listening_for_admin(activity: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not activity:
        return None
    questions: List[Dict[str, Any]] = []
    for item in activity.get("questions") or []:
        if not isinstance(item, dict):
            continue
        questions.append({
            "id": item.get("id"),
            "question": item.get("question"),
            "options": item.get("options"),
            "correct_answer": item.get("correct_answer"),
            "explanation": item.get("explanation"),
            "skill": item.get("skill"),
        })
    transcript = (
        activity.get("transcript")
        or activity.get("story")
        or activity.get("narration_text")
        or ""
    )
    return {
        "unit_id": activity.get("unit_id"),
        "title": activity.get("title"),
        "transcript": transcript,
        "narration_text": activity.get("narration_text") or transcript,
        "questions": questions,
        "answers": activity.get("answers"),
        "audio_url": activity.get("audio_url"),
        "word_count": activity.get("word_count"),
    }


def _format_item_type(item_type: str) -> str:
    labels = {
        "unit_opening": "Introduction",
        "reading": "Reading",
        "vocab": "Vocabulary",
        "vocabulary": "Vocabulary",
        "grammar": "Grammar",
        "listening": "Listening",
        "speaking": "Pronunciation",
        "writing": "Writing",
        "wrap_up": "Summary",
        "discussion": "Discussion",
        "visual": "Visual / diagram",
        "exercises": "Activity / exercise",
        "other": "Lesson section",
        "mcq": "Quiz",
    }
    key = (item_type or "").lower().strip()
    return labels.get(key, key.replace("_", " ").title() if key else "Section")


def _build_lesson_plan_items_view(
    items: List[Dict[str, Any]],
    subject_key: str,
) -> List[Dict[str, Any]]:
    from .book_plan_service import map_plan_item_to_module, subject_profile

    modules = subject_profile(subject_key).get("modules") or []
    module_titles = {m.get("key"): m.get("title") for m in modules if m.get("key")}

    out: List[Dict[str, Any]] = []
    for index, item in enumerate(items):
        module_key = map_plan_item_to_module(item, modules, subject_key)
        keywords = item.get("keywords") or []
        preview = ", ".join(str(k) for k in keywords if k) if keywords else None
        title = (item.get("title") or "").strip()
        if not title or title.lower() in ("content", "other"):
            title = _format_item_type(str(item.get("type") or ""))
        out.append(
            {
                "order": index + 1,
                "id": item.get("id"),
                "title": title,
                "type": item.get("type"),
                "type_label": _format_item_type(str(item.get("type") or "")),
                "section_key": module_key,
                "section": module_titles.get(module_key) if module_key else None,
                "preview": preview,
                "keywords": keywords,
                "must_cover": bool(item.get("must_cover", True)),
            }
        )
    return out


def _parts_from_session(session: Dict[str, Any]) -> List[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = []
    cache = session.get("part_cache") or {}
    for key in sorted(cache.keys(), key=lambda x: int(x) if str(x).isdigit() else 0):
        entry = cache[key] if isinstance(cache[key], dict) else {}
        parts.append({
            "part": int(key) if str(key).isdigit() else key,
            "teacher_text": entry.get("teacher_text", ""),
            "quiz": entry.get("quiz"),
        })
    if not parts and session.get("last_teacher_text"):
        parts.append({
            "part": int(session.get("unit_part", 0)),
            "teacher_text": session.get("last_teacher_text", ""),
            "quiz": session.get("last_quiz"),
        })
    return parts


def _resolve_quiz(
    session: Optional[Dict[str, Any]],
    progress_samples: List[Dict[str, Any]],
    student_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    if session and session.get("last_quiz"):
        return session["last_quiz"]
    if student_id:
        for sample in progress_samples:
            if sample.get("student_id") == student_id:
                quiz = (sample.get("progress") or {}).get("last_quiz")
                if quiz:
                    return quiz
    for sample in progress_samples:
        quiz = (sample.get("progress") or {}).get("last_quiz")
        if quiz:
            return quiz
    return None


def _history_lesson_meta(chapter_id: str) -> Optional[Dict[str, Any]]:
    book_id = progress_book_id(chapter_id)
    if "history" not in book_id.lower():
        return None
    try:
        from .history_lessons import get_lesson_by_unit_id
        return get_lesson_by_unit_id(chapter_id, book_id=book_id)
    except Exception:
        return None


def _history_media(chapter_id: str) -> Dict[str, Any]:
    book_id = progress_book_id(chapter_id)
    media: Dict[str, Any] = {}
    lesson = _history_lesson_meta(chapter_id)
    if lesson:
        media["video_filename"] = lesson.get("videoFilename")
        media["video_type"] = lesson.get("videoType")
        media["allowed_topics"] = lesson.get("allowedTopics")
        media["short_description"] = lesson.get("shortDescription")
    if "history" in book_id.lower():
        try:
            from .history_interactive_images import get_saved_interactive_images
            payload = get_saved_interactive_images(chapter_id, book_id=book_id)
            if payload:
                media["interactive_images"] = payload.get("images") or []
        except Exception:
            pass
    return media


def _build_student_view(
    chapter_id: str,
    student_id: Optional[str],
    unit_plan: Optional[Dict[str, Any]],
    progress_samples: List[Dict[str, Any]],
    *,
    supports_listening: bool = False,
) -> Dict[str, Any]:
    session = _resolve_stored_session(chapter_id, student_id)
    listening_raw = _load_listening_activity(chapter_id, session) if supports_listening else None
    teacher_text = ""
    unit_part = 0
    parts: List[Dict[str, Any]] = []
    storage_note = ""

    if session:
        teacher_text = session.get("last_teacher_text") or ""
        unit_part = int(session.get("unit_part", 0))
        parts = _parts_from_session(session)
        if not teacher_text and parts:
            teacher_text = parts[0].get("teacher_text") or ""
    else:
        storage_note = (
            "No stored active session for this lesson yet. "
            "Explanation and quiz appear after a student starts the lesson."
        )

    quiz = _resolve_quiz(session, progress_samples, student_id)
    vocabulary = collect_vocabulary_keywords(unit_plan or {})
    if unit_plan:
        for item in unit_plan.get("items") or []:
            if item.get("type") in ("vocab", "vocabulary") and item.get("title"):
                vocabulary.append(str(item["title"]))
    from .plan_deduplication import dedupe_strings

    vocabulary = dedupe_strings(vocabulary)

    return {
        "teacher_text": teacher_text,
        "quiz": quiz,
        "listening": _listening_for_admin(listening_raw),
        "vocabulary": vocabulary,
        "unit_part": unit_part,
        "parts": parts,
        "media": _history_media(chapter_id),
        "session_student_id": session.get("student_id") if session else None,
        "has_stored_session": bool(session),
        "storage_note": storage_note if not session and not teacher_text else "",
    }


def get_admin_lesson_content(
    chapter_id: str,
    student_id: Optional[str] = None,
    module_key: Optional[str] = None,
) -> Dict[str, Any]:
    from .english_book_curriculum import find_english_module_meta, items_for_module_skill
    from .subject_registry import (
        filter_unit_plan_for_subject,
        resolve_subject_key_from_chapter,
        subject_supports_listening,
        subject_supports_pronunciation,
    )

    subject_key = resolve_subject_key_from_chapter(chapter_id)
    supports_listening = subject_supports_listening(subject_key)
    supports_pronunciation = subject_supports_pronunciation(subject_key)

    meta = find_lesson_meta(chapter_id)
    if not meta:
        eng_meta = find_english_module_meta(chapter_id, module_key=module_key)
        if eng_meta:
            meta = {
                "subject_key": eng_meta.get("subject_key"),
                "subject_title": eng_meta.get("subject_title"),
                "module_key": eng_meta.get("module_key"),
                "module_title": eng_meta.get("module_title"),
                "name": eng_meta.get("name"),
                "description": eng_meta.get("description", ""),
                "chapter_id": chapter_id,
            }
    elif module_key:
        eng_meta = find_english_module_meta(chapter_id, module_key=module_key)
        if eng_meta:
            meta = {**meta, "module_key": eng_meta.get("module_key"), "module_title": eng_meta.get("module_title")}

    unit_plan = _find_any_unit_plan(chapter_id, student_id)
    if unit_plan:
        from .plan_deduplication import dedupe_unit_plan

        unit_plan = filter_unit_plan_for_subject(unit_plan, subject_key) or unit_plan
        unit_plan = dedupe_unit_plan(unit_plan)
    progress_samples = _find_progress_samples(chapter_id, student_id)
    student_view = _build_student_view(
        chapter_id, student_id, unit_plan, progress_samples, supports_listening=supports_listening
    )

    skill = None
    if module_key == "english_vocabulary":
        skill = "vocab"
    elif module_key == "english_listening":
        skill = "listening"
    elif module_key == "english_grammar":
        skill = "grammar"
    elif module_key == "english_speaking":
        skill = "speaking"

    if skill and unit_plan:
        filtered = items_for_module_skill(unit_plan, skill)
        student_view["module_items"] = filtered
        if skill == "vocab":
            student_view["vocabulary"] = collect_vocabulary_keywords({"items": filtered})
        if skill == "listening" and supports_listening and not student_view.get("listening"):
            listening_id = chapter_id if "english_g6" in chapter_id else chapter_id
            student_view["listening"] = _listening_for_admin(_load_listening_activity(listening_id))
    history_lesson = _history_lesson_meta(chapter_id)

    book_unit: Optional[Dict[str, Any]] = None
    try:
        book_unit = get_unit_content(chapter_id)
        if book_unit and book_unit.get("error"):
            book_unit = None
    except Exception:
        book_unit = None

    items = (unit_plan or {}).get("items") or []
    from .plan_deduplication import partition_plan_items_for_display

    partitioned = partition_plan_items_for_display(items)
    quiz_items = partitioned["quiz"]
    vocab_items = partitioned["vocabulary"]
    concept_items = partitioned["concepts"]
    activity_items = partitioned["activities"] + partitioned["visual"]
    summary_items = partitioned["summary"]
    objective_items = partitioned["objectives"]
    explanation_items = partitioned["explanation_items"]

    listening = _load_listening_activity(chapter_id) if supports_listening else None
    listening_questions = []
    listening_story = None
    if listening:
        listening_story = listening.get("story") or listening.get("transcript") or listening
        listening_questions = listening.get("questions") or listening.get("quiz") or []

    # Strip listening from stored session view for non-language subjects.
    if not supports_listening and student_view.get("listening"):
        student_view["listening"] = None
    quiz = student_view.get("quiz")
    if not supports_listening and isinstance(quiz, dict) and quiz.get("type") == "listening":
        student_view["quiz"] = None

    title = (meta or {}).get("name") if meta else chapter_id
    if history_lesson and history_lesson.get("title"):
        title = history_lesson["title"]
    from .lesson_catalog_service import resolve_lesson_meta, lesson_sections_for_chapter

    catalog_meta = resolve_lesson_meta(chapter_id)
    if catalog_meta.get("title") and catalog_meta.get("source") in ("book_catalog", "history_catalog"):
        title = catalog_meta["title"]
    if unit_plan and unit_plan.get("unit_title") and catalog_meta.get("source") == "fallback":
        title = unit_plan["unit_title"]
    elif book_unit and book_unit.get("title") and catalog_meta.get("source") == "fallback":
        title = book_unit["title"]

    lesson_plan_items = _build_lesson_plan_items_view(items, subject_key)
    language_sections = lesson_sections_for_chapter(chapter_id, unit_plan)

    return {
        "chapter_id": chapter_id,
        "lesson_title": title,
        "lesson_meta": {**(meta or {}), **catalog_meta},
        "language_sections": language_sections,
        "module_key": module_key or (meta or {}).get("module_key"),
        "history_lesson": history_lesson,
        "student_view": student_view,
        "unit_plan": unit_plan,
        "lesson_plan_items": lesson_plan_items,
        "listening": listening if supports_listening else None,
        "book_unit_content": book_unit,
        "progress_samples": progress_samples,
        "subject_key": subject_key,
        "supports_listening": supports_listening,
        "supports_pronunciation": supports_pronunciation,
        "summary": {
            "has_unit_plan": bool(unit_plan),
            "item_count": len(items),
            "quiz_count": len(quiz_items),
            "vocab_count": len(vocab_items),
            "concept_count": len(concept_items),
            "activity_count": len(activity_items),
            "summary_count": len(summary_items),
            "has_listening": bool(listening) if supports_listening else False,
            "has_book_content": bool(book_unit),
            "has_teacher_text": bool(student_view.get("teacher_text")),
            "has_stored_session": student_view.get("has_stored_session", False),
        },
        "generated_content": {
            "explanation_items": explanation_items,
            "objectives": objective_items,
            "vocabulary": vocab_items,
            "concepts": concept_items,
            "activities": activity_items,
            "summary": summary_items,
            "quiz": quiz_items,
            "listening_story": listening_story if supports_listening else None,
            "listening_questions": listening_questions if supports_listening else [],
        },
    }
