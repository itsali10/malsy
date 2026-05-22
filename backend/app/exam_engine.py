from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .exam_store import create_exam, load_exam, save_exam
from .llm import get_teacher_llm
from .prompts import EXAM_GENERATE_PROMPT, EXAM_GRADE_SHORT_PROMPT
from .unit_plan_store import load_unit_plan

# Reuse retrieval from the main lesson flow so we stay aligned with your Chroma metadata.
from .lesson_graph import retrieve_for_item


llm = get_teacher_llm()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _truncate(s: str, max_chars: int) -> str:
    s = s or ""
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 3] + "..."


def json_safe(text: str) -> Any:
    if text is None:
        raise ValueError("LLM returned empty content (None)")
    s = str(text).strip()

    if s.startswith("```") and "```" in s[3:]:
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()

    try:
        return json.loads(s)
    except Exception:
        pass

    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(s[start : end + 1])
        except Exception:
            pass

    raise ValueError(f"LLM did not return valid JSON. Got: {s[:200]!r}")


def _default_question_count(exam_type: str, unit_ids: List[str]) -> int:
    if exam_type == "weekly_unit":
        return 15
    # monthly cumulative
    # Keep it bounded so context size + grading stays manageable.
    base = 30
    if len(unit_ids) <= 1:
        return 20
    return base


def _build_unit_inputs(student_id: str, unit_id: str) -> Tuple[str, str]:
    """Return (plan_text, context_text) for a unit."""
    plan = load_unit_plan(student_id, unit_id) or {}
    unit_title = plan.get("unit_title") or ""
    items = plan.get("items") or []

    plan_lines: List[str] = []
    if unit_title:
        plan_lines.append(f"Unit title: {unit_title}")
    if items:
        plan_lines.append("Checklist items (in order):")
        for it in items:
            plan_lines.append(
                f"- id={it.get('id')} type={it.get('type')} title={it.get('title')} keywords={it.get('keywords', [])}"
            )
    else:
        plan_lines.append("Checklist items: (missing; best-effort exam from context)")

    # Retrieve broad context for the unit.
    chunks = retrieve_for_item(
        unit_id,
        "reading vocabulary grammar exercises discussion questions pictures diagrams charts writing listening speaking",
        k=10,
        unit_part=None,
        unit_pages=None,
    )
    context_parts: List[str] = []
    for c in chunks:
        page = (c.get("meta") or {}).get("pdf_page", "?")
        context_parts.append(f"[page {page}]\n{_truncate(c.get('text', ''), 1600)}")
    context_text = "\n\n".join(context_parts) if context_parts else ""

    return "\n".join(plan_lines), context_text


def generate_exam_questions(
    *,
    student_id: str,
    exam_type: str,
    unit_ids: List[str],
    course_week: Optional[int] = None,
    course_month: Optional[int] = None,
) -> List[Dict[str, Any]]:
    n = _default_question_count(exam_type, unit_ids)

    unit_sections: List[str] = []
    for uid in unit_ids:
        plan_text, context_text = _build_unit_inputs(student_id, uid)
        unit_sections.append(
            f"=== UNIT {uid} ===\n{plan_text}\n\nBook context:\n{context_text if context_text else '(no context found)'}"
        )

    window_desc = ""
    if exam_type == "weekly_unit" and course_week is not None:
        window_desc = f"Course week: {course_week}"
    if exam_type == "monthly_cumulative" and course_month is not None:
        window_desc = f"Course month: {course_month}"

    units_blob = "\n\n".join(unit_sections)
    user_content = f"""
Create an exam with exactly {n} questions.
Exam type: {exam_type}
{window_desc}
Units: {unit_ids}

Use these unit plans and book context:
{units_blob}
""".strip()

    msg = llm.invoke(
        [
            {"role": "system", "content": EXAM_GENERATE_PROMPT},
            {"role": "user", "content": user_content},
        ]
    )
    data = json_safe(msg.content)
    questions = data.get("questions", []) if isinstance(data, dict) else []
    if not isinstance(questions, list) or not questions:
        raise ValueError("Exam generation returned no questions")

    normalized: List[Dict[str, Any]] = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        qtype = str(q.get("type", "")).strip()
        prompt = str(q.get("prompt", "")).strip()
        source_unit_id = str(q.get("source_unit_id", "")).strip() or (unit_ids[0] if unit_ids else "")
        tags = q.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        normalized_q: Dict[str, Any] = {
            "id": f"q{i+1}",
            "type": qtype,
            "prompt": prompt,
            "source_unit_id": source_unit_id,
            "tags": tags,
        }

        # Optional / type-specific fields
        if qtype == "mcq":
            normalized_q["choices"] = q.get("choices", [])
            normalized_q["answer_key"] = q.get("answer_key")
        elif qtype == "fill_blank":
            normalized_q["answer_key"] = q.get("answer_key")
        elif qtype == "matching":
            normalized_q["answer_key"] = q.get("answer_key")
        elif qtype == "short_answer":
            normalized_q["expected_points"] = q.get("expected_points", [])
        else:
            # Unknown type; keep but it will be ungradable until extended.
            normalized_q["answer_key"] = q.get("answer_key")

        normalized.append(normalized_q)

    # Enforce exact count as best-effort.
    if len(normalized) > n:
        normalized = normalized[:n]
    return normalized


def start_weekly_unit_exam(
    *,
    student_id: str,
    unit_id: str,
    course_week: Optional[int] = None,
) -> Dict[str, Any]:
    exam_id = uuid.uuid4().hex
    questions = generate_exam_questions(
        student_id=student_id,
        exam_type="weekly_unit",
        unit_ids=[unit_id],
        course_week=course_week,
        course_month=None,
    )
    return create_exam(
        student_id=student_id,
        exam_id=exam_id,
        exam_type="weekly_unit",
        unit_ids=[unit_id],
        questions=questions,
        course_week=course_week,
        course_month=None,
    )


def start_monthly_cumulative_exam(
    *,
    student_id: str,
    unit_ids: List[str],
    course_month: Optional[int] = None,
) -> Dict[str, Any]:
    exam_id = uuid.uuid4().hex
    questions = generate_exam_questions(
        student_id=student_id,
        exam_type="monthly_cumulative",
        unit_ids=unit_ids,
        course_week=None,
        course_month=course_month,
    )
    return create_exam(
        student_id=student_id,
        exam_id=exam_id,
        exam_type="monthly_cumulative",
        unit_ids=unit_ids,
        questions=questions,
        course_week=None,
        course_month=course_month,
    )


def current_question(exam: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    idx = int(exam.get("current_question_index", 0) or 0)
    questions = exam.get("questions") or []
    if not isinstance(questions, list) or idx < 0 or idx >= len(questions):
        return None
    q = questions[idx]
    return q if isinstance(q, dict) else None


def public_question(question: Dict[str, Any]) -> Dict[str, Any]:
    """Strip grading keys before sending to client."""
    q = dict(question or {})
    q.pop("answer_key", None)
    q.pop("expected_points", None)
    return q


def _norm(s: Any) -> str:
    return str(s or "").strip().lower()


def _as_list(ans: Any) -> List[str]:
    if ans is None:
        return []
    if isinstance(ans, list):
        return [str(x).strip() for x in ans]
    s = str(ans)
    # Accept comma-separated
    parts = [p.strip() for p in s.replace("\n", ",").split(",")]
    return [p for p in parts if p]


def _as_mapping(ans: Any) -> Dict[str, str]:
    if ans is None:
        return {}
    if isinstance(ans, dict):
        return {str(k).strip(): str(v).strip() for k, v in ans.items()}
    # Try JSON
    try:
        data = json_safe(str(ans))
        if isinstance(data, dict):
            return {str(k).strip(): str(v).strip() for k, v in data.items()}
    except Exception:
        pass
    return {}


def _find_question(exam: Dict[str, Any], question_id: str) -> Optional[Tuple[int, Dict[str, Any]]]:
    questions = exam.get("questions") or []
    if not isinstance(questions, list):
        return None
    for idx, q in enumerate(questions):
        if isinstance(q, dict) and str(q.get("id")) == question_id:
            return idx, q
    return None


def grade_answer(
    *,
    student_id: str,
    exam_id: str,
    question_id: str,
    answer: Any,
) -> Dict[str, Any]:
    exam = load_exam(student_id, exam_id)
    if not exam:
        return {"error": "Exam not found"}
    if exam.get("status") == "finished":
        return {"error": "Exam already finished"}

    found = _find_question(exam, question_id)
    if not found:
        return {"error": "Question not found"}
    q_idx, q = found

    # Enforce linear flow by default.
    cur_idx = int(exam.get("current_question_index", 0) or 0)
    if q_idx != cur_idx:
        return {"error": "This is not the current question", "current_question_id": (current_question(exam) or {}).get("id")}

    qtype = str(q.get("type", "")).strip()
    correct = False
    score = 0.0
    feedback = ""
    missing: List[str] = []

    if qtype == "mcq":
        expected = _norm(q.get("answer_key"))
        got = _norm(answer)
        correct = got == expected
        score = 1.0 if correct else 0.0
        feedback = "Correct!" if correct else "Not quite. Review this idea and try similar questions."
    elif qtype == "fill_blank":
        expected_list = q.get("answer_key") or []
        if not isinstance(expected_list, list):
            expected_list = _as_list(expected_list)
        got_list = _as_list(answer)
        exp_norm = [_norm(x) for x in expected_list]
        got_norm = [_norm(x) for x in got_list]
        if exp_norm:
            matches = 0
            for i, exp in enumerate(exp_norm):
                if i < len(got_norm) and got_norm[i] == exp:
                    matches += 1
            score = matches / len(exp_norm)
            correct = score >= 0.999
            feedback = "Great job!" if correct else "Some blanks are incorrect. Review the lesson and try again next time."
            if not correct:
                for i, exp in enumerate(expected_list):
                    if i >= len(got_norm) or got_norm[i] != _norm(exp):
                        missing.append(f"blank_{i+1}")
        else:
            score = 0.0
            correct = False
            feedback = "This question is missing an answer key on the server."
    elif qtype == "matching":
        expected = q.get("answer_key") or {}
        if isinstance(expected, dict) and "left_to_right" in expected and isinstance(expected["left_to_right"], dict):
            expected_map = {str(k).strip(): str(v).strip() for k, v in expected["left_to_right"].items()}
        elif isinstance(expected, dict):
            expected_map = {str(k).strip(): str(v).strip() for k, v in expected.items()}
        else:
            expected_map = {}

        got_map = _as_mapping(answer)
        if expected_map:
            total = len(expected_map)
            matches = 0
            for lk, rv in expected_map.items():
                if _norm(got_map.get(lk)) == _norm(rv):
                    matches += 1
                else:
                    missing.append(lk)
            score = matches / total if total else 0.0
            correct = score >= 0.999
            feedback = "Nice work!" if correct else "Some matches are incorrect. Review the unit and try again next time."
        else:
            score = 0.0
            correct = False
            feedback = "This question is missing an answer key on the server."
    elif qtype == "short_answer":
        expected_points = q.get("expected_points") or []
        if not isinstance(expected_points, list):
            expected_points = _as_list(expected_points)
        msg = llm.invoke(
            [
                {"role": "system", "content": EXAM_GRADE_SHORT_PROMPT},
                {
                    "role": "user",
                    "content": f"""
Question:
{q.get('prompt','')}

Expected points:
{expected_points}

Student answer:
{answer}
""".strip(),
                },
            ]
        )
        result = json_safe(msg.content)
        correct = bool(result.get("correct", False))
        try:
            score = float(result.get("score", 0.0))
        except Exception:
            score = 1.0 if correct else 0.0
        score = max(0.0, min(1.0, score))
        feedback = str(result.get("feedback", "") or "")
        missing_val = result.get("missing", [])
        missing = missing_val if isinstance(missing_val, list) else []
    else:
        return {"error": f"Unsupported question type: {qtype}"}

    attempt = {
        "question_id": question_id,
        "correct": correct,
        "score": score,
        "feedback": feedback,
        "missing": missing,
        "ts": _now_iso(),
    }
    attempts = exam.get("attempts") or []
    if not isinstance(attempts, list):
        attempts = []
    attempts.append(attempt)
    exam["attempts"] = attempts

    # Update scoring.
    score_obj = exam.get("score") or {}
    try:
        score_obj["total"] = float(score_obj.get("total", 0.0)) + float(score)
    except Exception:
        score_obj["total"] = float(score)
    score_obj["max"] = float(score_obj.get("max", float(len(exam.get("questions") or []))) or 0.0)
    if score_obj["max"] > 0:
        score_obj["percent"] = round((score_obj["total"] / score_obj["max"]) * 100.0, 2)
    exam["score"] = score_obj

    # Per-unit breakdown
    unit_id = str(q.get("source_unit_id", "") or "")
    by_unit = score_obj.get("by_unit") or {}
    if not isinstance(by_unit, dict):
        by_unit = {}
    u = by_unit.get(unit_id) or {"total": 0.0, "max": 0.0, "percent": 0.0}
    u["total"] = float(u.get("total", 0.0)) + float(score)
    u["max"] = float(u.get("max", 0.0)) + 1.0
    u["percent"] = round((u["total"] / u["max"]) * 100.0, 2) if u["max"] > 0 else 0.0
    by_unit[unit_id] = u
    score_obj["by_unit"] = by_unit
    exam["score"] = score_obj

    # Advance to next question.
    exam["current_question_index"] = cur_idx + 1
    save_exam(exam)

    next_q = current_question(exam)
    done = next_q is None
    return {
        "exam_id": exam_id,
        "question_id": question_id,
        "correct": correct,
        "score": score,
        "feedback": feedback,
        "missing": missing,
        "done": done,
        "next_question": public_question(next_q) if next_q else None,
        "score_summary": exam.get("score"),
    }


def finish_exam(*, student_id: str, exam_id: str) -> Dict[str, Any]:
    exam = load_exam(student_id, exam_id)
    if not exam:
        return {"error": "Exam not found"}
    if exam.get("status") != "finished":
        exam["status"] = "finished"
        exam["finished_at"] = _now_iso()
        save_exam(exam)
    return {
        "exam_id": exam_id,
        "status": exam.get("status"),
        "unit_ids": exam.get("unit_ids", []),
        "score": exam.get("score"),
        "attempts_count": len(exam.get("attempts") or []),
        "finished_at": exam.get("finished_at"),
    }

