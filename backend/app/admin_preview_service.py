"""Admin lesson preview — same generation path as /session/start, no student side effects."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from .lesson_graph import _quiz_has_mcq_options, ensure_mcq_integrity, lesson_graph
from .lesson_content_mapping import build_unit_for_teaching, session_unit_from_mapping
from .session_engine import (
    get_or_create_plan,
    progress_book_id,
    select_units_for_session,
)

PREVIEW_STUDENT_ID = "__admin_preview__"
_preview_sessions: Dict[str, Dict[str, Any]] = {}


def _prepare_stored_quiz(quiz: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not quiz:
        return quiz
    q = dict(quiz)
    if _quiz_has_mcq_options(q):
        return ensure_mcq_integrity(q, shuffle=False)
    return q


def _quiz_for_client(quiz: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not quiz:
        return quiz
    q = dict(quiz)
    q.pop("correct_answer", None)
    q.pop("source_quote", None)
    return q


def _chapter_supports_listening(chapter_id: str) -> bool:
    from .subject_registry import resolve_subject_key_from_chapter, subject_supports_listening

    return subject_supports_listening(resolve_subject_key_from_chapter(chapter_id or ""))


def _listening_for_client(activity: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
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
            "skill": item.get("skill"),
        })
    return {
        "unit_id": activity.get("unit_id"),
        "title": activity.get("title"),
        "transcript": activity.get("transcript") or activity.get("narration_text") or "",
        "narration_text": activity.get("narration_text") or activity.get("transcript") or "",
        "questions": questions,
        "word_count": activity.get("word_count"),
    }


def _session_listening(sess: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    cid = str(sess.get("graph_chapter_id") or sess.get("chapter_id") or "")
    if cid and not _chapter_supports_listening(cid):
        return None
    activity = sess.get("listening")
    return _listening_for_client(activity) if activity else None


def _cache_part(
    sess: Dict[str, Any],
    part: int,
    teacher_text: str,
    stored_quiz: Optional[Dict[str, Any]],
    listening: Optional[Dict[str, Any]] = None,
) -> None:
    cache = sess.get("part_cache")
    if not isinstance(cache, dict):
        cache = {}
    entry: Dict[str, Any] = {"teacher_text": teacher_text or "", "quiz": stored_quiz}
    if listening:
        entry["listening"] = listening
    cache[str(int(part))] = entry
    sess["part_cache"] = cache


def _get_cached_part(sess: Dict[str, Any], part: int) -> Optional[Dict[str, Any]]:
    cache = sess.get("part_cache")
    if isinstance(cache, dict):
        return cache.get(str(int(part)))
    return None


def _max_unlocked_for_book(book_id: str) -> int:
    from .language_lesson_sections import last_part_index

    return last_part_index(book_id)


def _build_preview_session(
    chapter_id: str,
    *,
    lesson_title: str = "",
    lesson_desc: str = "",
) -> Dict[str, Any]:
    book_id = progress_book_id(chapter_id)
    plan = get_or_create_plan(book_id, lesson_title=lesson_title, lesson_description=lesson_desc)

    start_index = 0
    if ":" in chapter_id and "unit_" in chapter_id:
        requested_unit = chapter_id.split(":")[-1]
        for i, u in enumerate(plan.get("units") or []):
            if u.get("unit_id") == requested_unit or u.get("real_unit_id") == chapter_id:
                start_index = i
                break

    session_units, _next_index = select_units_for_session(plan, start_index)
    if not session_units:
        raise ValueError("No teachable units for this lesson")

    unit = session_units[0]
    mapped_unit = session_unit_from_mapping(chapter_id, book_id=book_id, plan_unit=unit)
    _, graph_chapter_id = build_unit_for_teaching(
        chapter_id, book_id=book_id, plan_unit=unit, unit_part=0
    )

    return {
        "student_id": PREVIEW_STUDENT_ID,
        "chapter_id": chapter_id,
        "book_id": book_id,
        "graph_chapter_id": graph_chapter_id,
        "session_units": [mapped_unit],
        "current_pos": 0,
        "unit_part": 0,
        "part_cache": {},
    }


def _run_graph_for_part(
    sess: Dict[str, Any],
    target_part: int,
    *,
    use_cache: bool = True,
) -> None:
    from .language_lesson_sections import clamp_part_index

    chapter_id = sess["chapter_id"]
    book_id = sess.get("book_id") or progress_book_id(chapter_id)
    target_part = clamp_part_index(book_id, target_part)

    if use_cache:
        cached = _get_cached_part(sess, target_part)
        if cached:
            sess["unit_part"] = target_part
            sess["last_quiz"] = cached.get("quiz")
            sess["last_teacher_text"] = cached.get("teacher_text", "")
            if cached.get("listening") and _chapter_supports_listening(
                str(sess.get("graph_chapter_id") or chapter_id)
            ):
                sess["listening"] = cached.get("listening")
            return

    unit = sess["session_units"][sess["current_pos"]]
    unit_for_teaching, graph_chapter_id = build_unit_for_teaching(
        chapter_id, book_id=book_id, plan_unit=unit, unit_part=target_part
    )
    sess["graph_chapter_id"] = graph_chapter_id

    out = lesson_graph.invoke({
        "student_id": PREVIEW_STUDENT_ID,
        "chapter_id": graph_chapter_id,
        "current_unit": unit_for_teaching,
        "student_answer": "",
        "provided_quiz": None,
    })

    sess["unit_part"] = target_part
    sess["last_quiz"] = _prepare_stored_quiz(out.get("quiz"))
    sess["last_teacher_text"] = out.get("teacher_text", "")
    cid = str(graph_chapter_id or chapter_id)
    if out.get("listening") and _chapter_supports_listening(cid):
        sess["listening"] = out["listening"]
    _cache_part(
        sess,
        target_part,
        sess["last_teacher_text"],
        sess["last_quiz"],
        sess.get("listening"),
    )


def _preview_response(sess: Dict[str, Any], target_part: int, max_unlocked: int) -> Dict[str, Any]:
    book_id = sess.get("book_id") or progress_book_id(sess["chapter_id"])
    parts: List[Dict[str, Any]] = []
    cache = sess.get("part_cache") or {}
    for key in sorted(cache.keys(), key=lambda x: int(x) if str(x).isdigit() else 0):
        entry = cache[key] if isinstance(cache[key], dict) else {}
        parts.append({
            "part": int(key) if str(key).isdigit() else key,
            "teacher_text": entry.get("teacher_text", ""),
            "quiz": entry.get("quiz"),
        })

    return {
        "preview": True,
        "done": False,
        "chapter_id": sess["chapter_id"],
        "book_id": book_id,
        "session_units": sess.get("session_units") or [],
        "current_unit_index_in_session": sess.get("current_pos", 0),
        "unit_part": target_part,
        "max_unlocked_part": max_unlocked,
        "teacher_text": sess.get("last_teacher_text", ""),
        "quiz": _quiz_for_client(sess.get("last_quiz")),
        "quiz_with_answers": sess.get("last_quiz"),
        "listening": _session_listening(sess),
        "parts": parts,
    }


def _ensure_session(
    chapter_id: str,
    *,
    lesson_title: str = "",
    lesson_desc: str = "",
) -> Dict[str, Any]:
    sess = _preview_sessions.get(chapter_id)
    if not sess:
        sess = _build_preview_session(chapter_id, lesson_title=lesson_title, lesson_desc=lesson_desc)
        _preview_sessions[chapter_id] = sess
    return sess


def start_admin_preview_session(
    chapter_id: str,
    *,
    lesson_title: str = "",
    lesson_desc: str = "",
    unit_part: int = 0,
) -> Dict[str, Any]:
    """Start or resume an in-memory admin preview (no progress / schedule writes)."""
    chapter_id = chapter_id.strip()
    if not chapter_id:
        raise ValueError("chapter_id is required")

    sess = _ensure_session(chapter_id, lesson_title=lesson_title, lesson_desc=lesson_desc)
    book_id = sess.get("book_id") or progress_book_id(chapter_id)
    max_unlocked = _max_unlocked_for_book(book_id)
    target = max(0, min(int(unit_part), max_unlocked))

    _run_graph_for_part(sess, target)
    return _preview_response(sess, target, max_unlocked)


def switch_admin_preview_part(chapter_id: str, target_part: int) -> Dict[str, Any]:
    chapter_id = chapter_id.strip()
    sess = _preview_sessions.get(chapter_id)
    if not sess:
        raise KeyError("No preview session — call preview-session first")

    book_id = sess.get("book_id") or progress_book_id(chapter_id)
    max_unlocked = _max_unlocked_for_book(book_id)
    target = max(0, min(int(target_part), max_unlocked))

    _run_graph_for_part(sess, target)
    return _preview_response(sess, target, max_unlocked)


def _clear_listening_caches(chapter_id: str) -> None:
    from .listening_store import delete_listening

    candidates = [chapter_id]
    if ":" in chapter_id:
        short = chapter_id.split(":")[-1]
        book = chapter_id.split(":")[0]
        candidates.extend([short, f"{book}:{short}"])

    seen: set = set()
    for cid in candidates:
        if not cid or cid in seen:
            continue
        seen.add(cid)
        delete_listening(cid)


def regenerate_admin_lesson(
    chapter_id: str,
    *,
    lesson_title: str = "",
    lesson_desc: str = "",
    unit_part: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Force-regenerate lesson content for admin review.
    Clears shared listening cache; does not modify student progress or schedules.
    """
    chapter_id = chapter_id.strip()
    if not chapter_id:
        raise ValueError("chapter_id is required")

    _clear_listening_caches(chapter_id)

    sess = _ensure_session(chapter_id, lesson_title=lesson_title, lesson_desc=lesson_desc)
    book_id = sess.get("book_id") or progress_book_id(chapter_id)
    max_unlocked = _max_unlocked_for_book(book_id)

    if unit_part is not None:
        parts_to_regen = [max(0, min(int(unit_part), max_unlocked))]
    else:
        parts_to_regen = list(range(max_unlocked + 1))

    cache = sess.get("part_cache")
    if isinstance(cache, dict):
        for p in parts_to_regen:
            cache.pop(str(int(p)), None)

    primary_part = parts_to_regen[0]
    for p in parts_to_regen:
        _run_graph_for_part(sess, p, use_cache=False)

    return _preview_response(sess, primary_part, max_unlocked)


def get_admin_preview_quiz(
    chapter_id: str,
    *,
    unit_part: int = 0,
    lesson_title: str = "",
    lesson_desc: str = "",
) -> Dict[str, Any]:
    """Return generated quiz for one lesson part (includes correct answers for admin)."""
    data = start_admin_preview_session(
        chapter_id,
        lesson_title=lesson_title,
        lesson_desc=lesson_desc,
        unit_part=unit_part,
    )
    return {
        "chapter_id": data["chapter_id"],
        "unit_part": data["unit_part"],
        "quiz": data.get("quiz_with_answers") or data.get("quiz"),
        "teacher_text": data.get("teacher_text", ""),
        "listening": data.get("listening"),
    }
