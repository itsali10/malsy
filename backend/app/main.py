import asyncio
import json
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import Dict, Any, List
from fastapi import Query
from .avatar_lipsync import (
    STRICT_THRESHOLDS_MS,
    build_viseme_timeline,
    evaluate_lipsync_quality,
    run_qa_harness,
)
from .session_engine import (
    get_or_create_plan,
    load_progress,
    save_progress,
    select_units_for_session,
    progress_book_id,
    progress_matches_book,
    plan_index_for_real_unit,
)
from .active_session_store import load_active_session, save_active_session, clear_active_session
from fastapi.middleware.cors import CORSMiddleware
from .lesson_graph import lesson_graph, retrieve_for_chapter
from .chapters_service import next_unit_id, list_units, get_unit_content
from .student_timeline_store import (
    ensure_student_start,
    load_timeline,
    course_week_month,
    record_unit_completed,
    units_in_course_month,
)
from .exam_engine import (
    start_weekly_unit_exam,
    start_monthly_cumulative_exam,
    current_question as exam_current_question,
    public_question as exam_public_question,
    grade_answer as exam_grade_answer,
    finish_exam as exam_finish,
)
from .exam_store import load_exam
from .evaluation_engine import weekly_evaluation, monthly_evaluation
from .evaluation_store import eval_summary, unit_breakdown, reset_student_eval
from .tts_api import mount_tts_static, router as tts_router
from .speech_api import router as speech_router
from .pronunciation_api import router as pronunciation_router
from .routers import auth as auth_router
from .routers import users as users_router
from .routers import subjects as subjects_router
from .routers import schedules as schedules_router
from .routers import enrollments as enrollments_router
from .routers import attendance as attendance_router
from .routers import quiz as quiz_router
from .routers import evaluations as evaluations_router
from .routers import labs as labs_router
from .routers import notifications as notifications_router
from .routers import dashboard as dashboard_router
from .routers import admin as admin_router
from .database import engine
from sqlalchemy import text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print("✅  Database connected successfully")
    except Exception as e:
        print(f"❌  Database connection FAILED: {e}")
    yield
    # ── shutdown ─────────────────────────────────────────────
    await engine.dispose()


app = FastAPI(lifespan=lifespan)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    msg = str(exc.orig) if exc.orig else str(exc)
    if "unique" in msg.lower() or "duplicate" in msg.lower():
        return JSONResponse(status_code=409, content={"detail": "A record with this data already exists."})
    if "foreign key" in msg.lower() or "violates foreign key" in msg.lower():
        return JSONResponse(status_code=400, content={"detail": "Referenced record does not exist."})
    return JSONResponse(status_code=400, content={"detail": "Database constraint violation."})


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    return JSONResponse(
        status_code=500,
        content={"detail": "A database error occurred. Please try again."},
    )


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred."},
    )


mount_tts_static(app)
app.include_router(tts_router)
app.include_router(speech_router)
app.include_router(pronunciation_router)
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(subjects_router.router)
app.include_router(schedules_router.router)
app.include_router(enrollments_router.router)
app.include_router(attendance_router.router)
app.include_router(quiz_router.router)
app.include_router(evaluations_router.router)
app.include_router(labs_router.router)
app.include_router(notifications_router.router)
app.include_router(dashboard_router.router)
app.include_router(admin_router.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Single-student in-memory session
ACTIVE_SESSION: Dict[str, Any] | None = None

@app.get("/")
def root():
    """Root endpoint providing API information."""
    return {
        "message": "AI Teacher System API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "start_session": "POST /session/start",
            "answer_quiz": "POST /session/answer",
            "next_unit": "POST /session/next_unit",
            "continue_part2": "POST /session/continue_part2",
            "list_units": "GET /units",
            "get_unit": "GET /unit/{unit_id}",
            "start_weekly_exam": "POST /exam/weekly/start",
            "start_monthly_exam": "POST /exam/monthly/start",
            "answer_exam": "POST /exam/answer",
            "finish_exam": "POST /exam/finish",
            "get_exam": "GET /exam/{exam_id}",
            "weekly_evaluation": "GET /evaluation/weekly",
            "monthly_evaluation": "GET /evaluation/monthly",
            "evaluation_summary": "GET /evaluation/summary",
            "evaluation_unit": "GET /evaluation/unit/{unit_id}",
            "evaluation_reset": "POST /evaluation/reset",
            "avatar_lipsync_prepare": "POST /avatar/lipsync/prepare",
            "avatar_lipsync_evaluate": "POST /avatar/lipsync/evaluate",
            "avatar_lipsync_qa": "POST /avatar/lipsync/qa/run",
            "teacher_websocket": "WS /ws/teacher",
            "tts": "POST /tts",
            "speech_transcribe": "POST /speech/transcribe",
        }
    }

class StartSessionReq(BaseModel):
    student_id: str
    chapter_id: str

class NextUnitReq(BaseModel):
    student_id: str

class ContinuePart2Req(BaseModel):
    student_id: str

class AnswerReq(BaseModel):
    student_id: str
    student_answer: str

class WeeklyExamStartReq(BaseModel):
    student_id: str
    unit_id: str

class MonthlyExamStartReq(BaseModel):
    student_id: str

class ExamAnswerReq(BaseModel):
    student_id: str
    exam_id: str
    question_id: str
    answer: Any

class ExamFinishReq(BaseModel):
    student_id: str
    exam_id: str

class EvaluationResetReq(BaseModel):
    student_id: str


class AvatarLipSyncPrepareReq(BaseModel):
    student_id: str
    text: str
    speech_rate: float = 1.0


class AvatarLipSyncEvaluateReq(BaseModel):
    expected_visemes: List[Dict[str, Any]]
    actual_visemes: List[Dict[str, Any]]
    utterance_start_ms: int
    speech_started_ms: int
    speech_ended_ms: int
    audio_end_ms: int
    transport_stats: Dict[str, Any] | None = None


class AvatarLipSyncQARunReq(BaseModel):
    utterance_count: int = 100
    jitter_ms: int = 35
    out_of_order_chance: float = 0.0


def _ensure_session_in_memory() -> Dict[str, Any] | None:
    global ACTIVE_SESSION
    if ACTIVE_SESSION is not None:
        return ACTIVE_SESSION

    # try restore from disk
    disk = load_active_session()
    if disk:
        ACTIVE_SESSION = disk
        return ACTIVE_SESSION

    return None

@app.post("/session/start")
def start_session(req: StartSessionReq):
    global ACTIVE_SESSION
    ensure_student_start(req.student_id)

    # Step A: try to start requested chapter
    def _start_chapter(chapter_id: str):
        book_id = progress_book_id(chapter_id)
        plan = get_or_create_plan(book_id)
        progress = load_progress(req.student_id)

        # If chapter_id is a specific unit (e.g., "english_g6:unit_01"), find it in the plan
        start_index = 0
        if ":" in chapter_id and "unit_" in chapter_id:
            # Extract the unit part (e.g., "unit_01" from "english_g6:unit_01")
            requested_unit = chapter_id.split(":")[-1]
            # Find this unit in the plan
            plan_units = plan.get("units", [])
            for i, u in enumerate(plan_units):
                if u.get("unit_id") == requested_unit or u.get("real_unit_id") == chapter_id:
                    start_index = i
                    break
        # Otherwise, resume from saved book progress (same book another day)
        elif progress_matches_book(progress.get("chapter_id"), book_id):
            start_index = int(progress.get("unit_index", 0))

        session_units, _next_index = select_units_for_session(plan, start_index)

        if not session_units:
            return None  # chapter complete

        # Check if we're resuming a unit part (0 = first half, 1 = second half)
        unit = session_units[0]
        unit_part = 0  # Default to first half
        if progress_matches_book(progress.get("chapter_id"), book_id):
            unit_part = int(progress.get("unit_part", 0))

        # unit_index = plan index of the unit we are teaching (next /session/start with same book_id resumes here)
        save_progress(req.student_id, book_id, start_index, unit_part)

        real_unit_id = unit.get("real_unit_id") or unit.get("unit_id")
        graph_chapter_id = real_unit_id

        # Create single active session
        ACTIVE_SESSION = {
            "student_id": req.student_id,
            "chapter_id": chapter_id,
            "book_id": book_id,
            "graph_chapter_id": graph_chapter_id,
            "session_units": session_units,
            "current_pos": 0,
            "unit_part": unit_part,
        }
        save_active_session(ACTIVE_SESSION)

        # Get unit page info from Chroma
        from .chapters_service import get_unit_content
        try:
            unit_info = get_unit_content(real_unit_id)
            if "error" in unit_info:
                # Fallback if unit not found in Chroma
                unit_pages = {"start_page": 0, "end_page": 0}
            else:
                unit_pages = {
                    "start_page": unit_info.get("start_page", 0),
                    "end_page": unit_info.get("end_page", 0)
                }
        except Exception as e:
            # Fallback on any error
            unit_pages = {"start_page": 0, "end_page": 0}
        
        # Ensure lesson_graph gets the full unit_id for Chroma lookup
        unit_for_teaching = {**unit, "unit_id": real_unit_id, "unit_part": unit_part, "unit_pages": unit_pages}
        try:
            out = lesson_graph.invoke({
                "student_id": req.student_id,
                "chapter_id": graph_chapter_id,
                "current_unit": unit_for_teaching,
                "student_answer": "",
                "provided_quiz": None,
            })
            # Debug: Print final state to see what we got
            print(f"[DEBUG] Graph completed. teacher_text length: {len(out.get('teacher_text', ''))}, quiz: {out.get('quiz', {})}")
            print(f"[DEBUG] Graph done flag: {out.get('done', False)}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {"error": f"Failed to start lesson: {str(e)}"}

        # store last quiz so /answer grades the SAME quiz
        ACTIVE_SESSION["last_quiz"] = out.get("quiz")
        save_active_session(ACTIVE_SESSION)

        timeline = load_timeline(req.student_id)
        course_week, course_month = course_week_month(timeline)
        evaluation_summary = eval_summary(req.student_id)
        return {
            "done": False,
            "chapter_id": chapter_id,
            "session_units": session_units,
            "current_unit_index_in_session": 0,
            "unit_part": unit_part,  # 0 = first half (pages 1-5), 1 = second half (pages 6-10)
            "teacher_text": out.get("teacher_text"),
            "quiz": out.get("quiz"),
            "course_week": course_week,
            "course_month": course_month,
            "evaluation_summary": evaluation_summary,
        }

    # 1) Try requested chapter
    result = _start_chapter(req.chapter_id)
    if result is not None:
        return result

    # 2) If it is complete, automatically move to the next chapter
    nxt = next_unit_id(req.chapter_id)
    if not nxt:
        clear_active_session()
        ACTIVE_SESSION = None
        return {"done": True, "message": "All chapters complete!"}

    nb = progress_book_id(nxt)
    np = get_or_create_plan(nb)
    ni = plan_index_for_real_unit(np, nxt)
    if ni is not None:
        save_progress(req.student_id, nb, ni, 0)

    result2 = _start_chapter(nxt)
    if result2 is None:
        # edge case: next chapter has no units
        clear_active_session()
        ACTIVE_SESSION = None
        return {"done": True, "message": "Next chapter has no teachable units."}

    # tell frontend we auto-advanced
    result2["auto_advanced_from"] = req.chapter_id
    return result2
@app.post("/session/next_unit")
def next_unit(req: NextUnitReq):
    global ACTIVE_SESSION
    sess = _ensure_session_in_memory()
    if not sess:
        return {"error": "No active session. Call /session/start first."}

    # single-student safety
    if req.student_id != sess.get("student_id"):
        return {"error": "This server is in single-student mode. Student_id mismatch."}

    chapter_id = sess["chapter_id"]
    units = sess["session_units"]
    pos = sess["current_pos"] + 1

    if pos >= len(units):
        # Session may contain only 1 unit (UNITS_PER_SESSION=1). Auto-advance to the next unit.
        cur = sess["session_units"][sess["current_pos"]]
        cur_id = cur.get("real_unit_id") or cur.get("unit_id") or chapter_id
        nxt = next_unit_id(cur_id)
        if not nxt:
            clear_active_session()
            ACTIVE_SESSION = None
            return {"done": True, "message": "All chapters complete!"}

        clear_active_session()
        ACTIVE_SESSION = None
        result = start_session(StartSessionReq(student_id=req.student_id, chapter_id=nxt))
        if isinstance(result, dict):
            result["auto_advanced_from"] = chapter_id
        return result

    sess["current_pos"] = pos
    save_active_session(sess)

    unit = units[pos]
    unit_part = sess.get("unit_part", 0)  # Reset to part 0 for new unit
    # Use real_unit_id if available (from manifest), otherwise use unit_id
    real_unit_id = unit.get("real_unit_id") or unit.get("unit_id")
    
    # Get unit page info
    from .chapters_service import get_unit_content
    unit_info = get_unit_content(real_unit_id)
    unit_pages = {
        "start_page": unit_info.get("start_page", 0),
        "end_page": unit_info.get("end_page", 0)
    }
    
    unit_for_teaching = {**unit, "unit_id": real_unit_id, "unit_part": unit_part, "unit_pages": unit_pages}
    sess["unit_part"] = unit_part
    sess["graph_chapter_id"] = real_unit_id
    graph_chapter_id = real_unit_id
    out = lesson_graph.invoke({
        "student_id": req.student_id,
        "chapter_id": graph_chapter_id,
        "current_unit": unit_for_teaching,
        "student_answer": "",
        "provided_quiz": None,
    })
    sess["last_quiz"] = out.get("quiz")
    save_active_session(sess)

    timeline = load_timeline(req.student_id)
    course_week, course_month = course_week_month(timeline)

    return {
        "done": False,
        "chapter_id": chapter_id,
        "current_unit_index_in_session": pos,
        "unit_part": unit_part,
        "teacher_text": out.get("teacher_text"),
        "quiz": out.get("quiz"),
        "course_week": course_week,
        "course_month": course_month,
    }

@app.post("/session/answer")
def answer(req: AnswerReq):
    global ACTIVE_SESSION
    sess = _ensure_session_in_memory()
    if not sess:
        return {"error": "No active session. Call /session/start first."}

    # single-student safety
    if req.student_id != sess.get("student_id"):
        return {"error": "This server is in single-student mode. Student_id mismatch."}

    chapter_id = sess["chapter_id"]
    unit = sess["session_units"][sess["current_pos"]]
    unit_part = sess.get("unit_part", 0)
    # Use real_unit_id if available (from manifest), otherwise use unit_id
    real_unit_id = unit.get("real_unit_id") or unit.get("unit_id")
    
    # Get unit page info
    from .chapters_service import get_unit_content
    unit_info = get_unit_content(real_unit_id)
    unit_pages = {
        "start_page": unit_info.get("start_page", 0),
        "end_page": unit_info.get("end_page", 0)
    }
    
    unit_for_teaching = {**unit, "unit_id": real_unit_id, "unit_part": unit_part, "unit_pages": unit_pages}

    graph_chapter_id = sess.get("graph_chapter_id") or real_unit_id

    out = lesson_graph.invoke({
        "student_id": req.student_id,
        "chapter_id": graph_chapter_id,
        "current_unit": unit_for_teaching,
        # grade the SAME quiz we served last time
        "provided_quiz": sess.get("last_quiz"),
        "student_answer": req.student_answer
    })


    evaluation = out.get("evaluation")
    recommendations = out.get("recommendations")
    evaluation_summary = out.get("evaluation_summary") or eval_summary(req.student_id)

    # wrong answer - check if it's hint (1st or 2nd attempt) or remediation (3rd attempt)
    if not evaluation.get("correct", False):
        hint_text = out.get("hint_text", "")
        remediation_text = out.get("remediation_text", "")
        hint_count = out.get("hint_count", 0)
        
        if hint_text:
            # 1st or 2nd incorrect answer - provide hint
            return {
                "correct": False,
                "evaluation": evaluation,
                "hint": hint_text,
                "hint_count": hint_count,
                "remediation_text": "",
                "quiz": sess.get("last_quiz"),  # Keep same quiz
                "next_action": "answer_again",
                "recommendations": recommendations,
                "evaluation_summary": evaluation_summary,
            }
        elif remediation_text:
            # 3rd incorrect answer - provide full remediation
            return {
                "correct": False,
                "evaluation": evaluation,
                "hint": "",
                "hint_count": 2,
                "remediation_text": remediation_text,
                "quiz": sess.get("last_quiz"),  # Keep same quiz
                "next_action": "answer_again",
                "recommendations": recommendations,
                "evaluation_summary": evaluation_summary,
            }
        else:
            # Fallback (shouldn't happen)
            return {
                "correct": False,
                "evaluation": evaluation,
                "hint": "Try again! Think about what we learned.",
                "remediation_text": "",
                "quiz": sess.get("last_quiz"),
                "next_action": "answer_again",
                "recommendations": recommendations,
                "evaluation_summary": evaluation_summary,
            }

    # Correct answer - check if we need to move to part 2 or next unit
    if unit_part == 0:
        # Finished part 1, move to part 2 of same unit
        sess["unit_part"] = 1
        book_id = sess.get("book_id") or progress_book_id(chapter_id)
        plan = get_or_create_plan(book_id)
        uidx = plan_index_for_real_unit(plan, real_unit_id)
        if uidx is None:
            uidx = int(sess.get("current_pos", 0))
        save_progress(req.student_id, book_id, uidx, 1)
        save_active_session(sess)
        timeline = load_timeline(req.student_id)
        course_week, course_month = course_week_month(timeline)
        return {
            "correct": True,
            "evaluation": evaluation,
            "advance_text": out.get("advance_text"),
            "next_action": "continue_unit_part2",  # Signal to start part 2
            "message": "Great job! You've finished the first half (pages 1-5). Ready for the second half (pages 6-10)?",
            "course_week": course_week,
            "course_month": course_month,
            "recommendations": recommendations,
            "evaluation_summary": evaluation_summary,
        }
    else:
        # Finished part 2: persist cursor like /session/next_unit so the next POST /session/start opens the next unit
        timeline = record_unit_completed(req.student_id, real_unit_id, completed_parts=2)
        course_week, course_month = course_week_month(timeline)
        units = sess["session_units"]
        pos = sess["current_pos"] + 1
        base = {
            "correct": True,
            "evaluation": evaluation,
            "advance_text": out.get("advance_text"),
            "unit_completed": True,
            "completed_unit_id": real_unit_id,
            "weekly_exam_available": True,
            "start_weekly_exam_endpoint": "/exam/weekly/start",
            "course_week": course_week,
            "course_month": course_month,
            "recommendations": recommendations,
            "evaluation_summary": evaluation_summary,
        }
        if pos >= len(units):
            book_id = sess.get("book_id") or progress_book_id(chapter_id)
            plan = get_or_create_plan(book_id)
            idx = plan_index_for_real_unit(plan, real_unit_id)
            if idx is None:
                p0 = load_progress(req.student_id)
                idx = max(0, int(p0.get("unit_index", 1)) - 1)
            next_idx = idx + 1
            plan_units = plan.get("units") or []
            clear_active_session()
            ACTIVE_SESSION = None
            if next_idx >= len(plan_units):
                return {
                    **base,
                    "next_action": "all_complete",
                    "message": "All chapters complete!",
                }
            save_progress(req.student_id, book_id, next_idx, 0)
            return {
                **base,
                "next_action": "session_start",
                "book_id": book_id,
                "message": "Unit complete. Next session: POST /session/start with the same book id (e.g. book_id).",
            }
        sess["current_pos"] = pos
        sess["unit_part"] = 0
        save_active_session(sess)
        return {**base, "next_action": "next_unit"}

@app.post("/session/continue_part2")
def continue_part2(req: ContinuePart2Req):
    """Continue to part 2 (pages 6-10) of the current unit after completing part 1."""
    sess = _ensure_session_in_memory()
    if not sess:
        return {"error": "No active session. Call /session/start first."}

    # single-student safety
    if req.student_id != sess.get("student_id"):
        return {"error": "This server is in single-student mode. Student_id mismatch."}

    chapter_id = sess["chapter_id"]
    unit = sess["session_units"][sess["current_pos"]]
    
    # Move to part 2
    sess["unit_part"] = 1
    save_active_session(sess)
    
    # CRITICAL: Reset progress for part 2 so it starts from the beginning
    # Part 2 should teach all items again, but with content from pages 6-10
    from .progress_store import reset_unit_progress
    real_unit_id = unit.get("real_unit_id") or unit.get("unit_id")
    reset_unit_progress(req.student_id, real_unit_id)
    print(f"[DEBUG] continue_part2: Reset progress for part 2 - will start from item 0 with pages 6-10")
    
    # Get unit page info
    from .chapters_service import get_unit_content
    unit_info = get_unit_content(real_unit_id)
    unit_pages = {
        "start_page": unit_info.get("start_page", 0),
        "end_page": unit_info.get("end_page", 0)
    }
    
    unit_for_teaching = {**unit, "unit_id": real_unit_id, "unit_part": 1, "unit_pages": unit_pages}
    graph_chapter_id = sess.get("graph_chapter_id") or real_unit_id
    out = lesson_graph.invoke({
        "student_id": req.student_id,
        "chapter_id": graph_chapter_id,
        "current_unit": unit_for_teaching,
        "student_answer": "",
        "provided_quiz": None,
    })
    
    sess["last_quiz"] = out.get("quiz")
    save_active_session(sess)
    timeline = load_timeline(req.student_id)
    course_week, course_month = course_week_month(timeline)
    
    return {
        "done": False,
        "chapter_id": chapter_id,
        "session_units": sess["session_units"],
        "current_unit_index_in_session": sess["current_pos"],
        "unit_part": 1,  # Second half (pages 6-10)
        "teacher_text": out.get("teacher_text"),
        "quiz": out.get("quiz"),
        "course_week": course_week,
        "course_month": course_month,
    }

@app.get("/units")
def get_units(book_id: str | None = Query(default=None)):
    units = list_units()
    if book_id:
        units = [u for u in units if u.get("book_id") == book_id]
    return {"units": units}

def _normalize_unit_id_path(unit_id: str) -> str:
    """Strip accidental 'unit_id:' prefix when OpenAPI/Swagger example text was pasted into the path."""
    s = (unit_id or "").strip()
    low = s.lower()
    if low.startswith("unit_id:"):
        return s.split(":", 1)[1].strip()
    return s


@app.get("/unit/{unit_id}")
def get_unit(unit_id: str):
    return get_unit_content(_normalize_unit_id_path(unit_id))


def _public_exam_state(exam: Dict[str, Any]) -> Dict[str, Any]:
    q = exam_current_question(exam)
    attempts = exam.get("attempts") or []
    if not isinstance(attempts, list):
        attempts = []
    public_attempts = []
    for a in attempts:
        if not isinstance(a, dict):
            continue
        public_attempts.append(
            {
                "question_id": a.get("question_id"),
                "correct": a.get("correct"),
                "score": a.get("score"),
                "feedback": a.get("feedback"),
                "missing": a.get("missing", []),
                "ts": a.get("ts"),
            }
        )
    questions_total = len(exam.get("questions") or [])
    return {
        "exam_id": exam.get("exam_id"),
        "student_id": exam.get("student_id"),
        "exam_type": exam.get("exam_type"),
        "course_week": exam.get("course_week"),
        "course_month": exam.get("course_month"),
        "unit_ids": exam.get("unit_ids", []),
        "status": exam.get("status"),
        "current_question_index": exam.get("current_question_index", 0),
        "questions_total": questions_total,
        "current_question": exam_public_question(q) if q else None,
        "attempts": public_attempts,
        "score": exam.get("score"),
        "created_at": exam.get("created_at"),
        "finished_at": exam.get("finished_at"),
    }


@app.post("/exam/weekly/start")
def start_weekly_exam(req: WeeklyExamStartReq):
    timeline = ensure_student_start(req.student_id)
    course_week, _course_month = course_week_month(timeline)
    exam = start_weekly_unit_exam(student_id=req.student_id, unit_id=req.unit_id, course_week=course_week)
    return _public_exam_state(exam)


@app.post("/exam/monthly/start")
def start_monthly_exam(req: MonthlyExamStartReq):
    timeline = ensure_student_start(req.student_id)
    _course_week, course_month = course_week_month(timeline)
    recs = units_in_course_month(timeline, course_month)
    unit_ids = []
    seen = set()
    for r in recs:
        uid = r.get("unit_id")
        if uid and uid not in seen:
            seen.add(uid)
            unit_ids.append(uid)

    if not unit_ids:
        return {
            "error": "No completed units recorded for this course month yet.",
            "course_month": course_month,
            "hint": "Complete at least one unit (part 2) first, then start the monthly exam.",
        }

    exam = start_monthly_cumulative_exam(student_id=req.student_id, unit_ids=unit_ids, course_month=course_month)
    return _public_exam_state(exam)


@app.get("/exam/{exam_id}")
def get_exam(exam_id: str, student_id: str = Query(...)):
    exam = load_exam(student_id, exam_id)
    if not exam:
        return {"error": "Exam not found"}
    return _public_exam_state(exam)


@app.post("/exam/answer")
def answer_exam(req: ExamAnswerReq):
    return exam_grade_answer(
        student_id=req.student_id,
        exam_id=req.exam_id,
        question_id=req.question_id,
        answer=req.answer,
    )


@app.post("/exam/finish")
def finish_exam(req: ExamFinishReq):
    return exam_finish(student_id=req.student_id, exam_id=req.exam_id)


@app.get("/evaluation/weekly")
def get_weekly_evaluation(student_id: str = Query(...), week: int | None = Query(default=None)):
    return weekly_evaluation(student_id, week=week)


@app.get("/evaluation/monthly")
def get_monthly_evaluation(student_id: str = Query(...), month: int | None = Query(default=None)):
    return monthly_evaluation(student_id, month=month)


@app.get("/evaluation/summary")
def get_evaluation_summary(student_id: str = Query(...)):
    return eval_summary(student_id)


@app.get("/evaluation/unit/{unit_id}")
def get_evaluation_unit(unit_id: str, student_id: str = Query(...)):
    return unit_breakdown(student_id, _normalize_unit_id_path(unit_id))


@app.post("/evaluation/reset")
def reset_evaluation(req: EvaluationResetReq):
    reset_student_eval(req.student_id)
    return {"ok": True}


@app.post("/avatar/lipsync/prepare")
def avatar_lipsync_prepare(req: AvatarLipSyncPrepareReq):
    visemes = build_viseme_timeline(text=req.text, speech_rate=req.speech_rate)
    # Client should set this at send time using its own monotonic clock.
    utterance_start_ms = 0
    return {
        "student_id": req.student_id,
        "text": req.text,
        "speech_rate": req.speech_rate,
        "utterance_start_ms": utterance_start_ms,
        "visemes": visemes,
        "strict_thresholds_ms": STRICT_THRESHOLDS_MS,
        "notes": {
            "sequence_contract": "Use sequence_id to detect out-of-order events.",
            "timing_contract": "time_ms is relative to utterance_start_ms.",
        },
    }


@app.post("/avatar/lipsync/evaluate")
def avatar_lipsync_evaluate(req: AvatarLipSyncEvaluateReq):
    return evaluate_lipsync_quality(
        expected_visemes=req.expected_visemes,
        actual_visemes=req.actual_visemes,
        utterance_start_ms=req.utterance_start_ms,
        speech_started_ms=req.speech_started_ms,
        speech_ended_ms=req.speech_ended_ms,
        audio_end_ms=req.audio_end_ms,
        transport_stats=req.transport_stats,
    )


@app.post("/avatar/lipsync/qa/run")
def avatar_lipsync_qa_run(req: AvatarLipSyncQARunReq):
    return run_qa_harness(
        utterance_count=req.utterance_count,
        jitter_ms=req.jitter_ms,
        out_of_order_chance=req.out_of_order_chance,
    )


def _split_teacher_sentences(text: Any) -> List[str]:
    if text is None:
        return []
    t = str(text).strip()
    if not t:
        return []
    parts = re.split(r"(?<=[.!?])\s+|\n+", t)
    out = [p.strip() for p in parts if p.strip()]
    return out if out else [t]


async def _ws_send(websocket: WebSocket, msg_type: str, payload: Dict[str, Any]) -> None:
    await websocket.send_text(json.dumps({"type": msg_type, "payload": payload}))


async def _ws_stream_teacher_text(websocket: WebSocket, teacher_text: Any) -> None:
    sentences = _split_teacher_sentences(teacher_text)
    for i, sent in enumerate(sentences):
        await _ws_send(websocket, "teacher_sentence", {"index": i, "text": sent})
    await _ws_send(websocket, "teacher_done", {})


async def _ws_push_session_payload(websocket: WebSocket, result: Dict[str, Any]) -> None:
    if not isinstance(result, dict):
        return
    if result.get("error"):
        await _ws_send(websocket, "error", {"message": str(result["error"])})
        return
    if result.get("done"):
        await _ws_send(websocket, "teacher_done", {})
        return
    await _ws_stream_teacher_text(websocket, result.get("teacher_text"))
    quiz = result.get("quiz") or {}
    qtext = quiz.get("question") if isinstance(quiz, dict) else None
    if qtext:
        await _ws_send(websocket, "quiz", {"question": str(qtext)})
    es = result.get("evaluation_summary")
    if isinstance(es, dict):
        await _ws_send(websocket, "evaluation_summary", es)
    rec = result.get("recommendations")
    if isinstance(rec, dict):
        await _ws_send(websocket, "recommendations", rec)
    na = result.get("next_action")
    if na:
        await _ws_send(websocket, "next_action", {"next_action": str(na)})


async def _ws_push_answer_payload(websocket: WebSocket, result: Dict[str, Any]) -> None:
    if not isinstance(result, dict):
        return
    if result.get("error"):
        await _ws_send(websocket, "error", {"message": str(result["error"])})
        return
    idx = 0
    for key in ("advance_text", "remediation_text", "hint"):
        chunk = result.get("hint") if key == "hint" else result.get(key)
        if chunk:
            for s in _split_teacher_sentences(chunk):
                await _ws_send(websocket, "teacher_sentence", {"index": idx, "text": s})
                idx += 1
    await _ws_send(websocket, "teacher_done", {})
    quiz = result.get("quiz") or {}
    if isinstance(quiz, dict) and quiz.get("question"):
        await _ws_send(websocket, "quiz", {"question": str(quiz["question"])})
    es = result.get("evaluation_summary")
    if isinstance(es, dict):
        await _ws_send(websocket, "evaluation_summary", es)
    rec = result.get("recommendations")
    if isinstance(rec, dict):
        await _ws_send(websocket, "recommendations", rec)
    na = result.get("next_action")
    if na:
        await _ws_send(websocket, "next_action", {"next_action": str(na)})


@app.websocket("/ws/teacher")
async def ws_teacher(websocket: WebSocket):
    """Unity teacher client: same message contract as BackendTeacherWsClient."""
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                await _ws_send(websocket, "error", {"message": "Invalid JSON"})
                continue
            msg_type = obj.get("type")
            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
            payload = payload or {}

            if msg_type == "ping":
                await _ws_send(websocket, "pong", {})
                continue

            if msg_type == "session_start":
                sid = str(payload.get("student_id", ""))
                cid = str(payload.get("chapter_id", ""))
                result = await asyncio.to_thread(
                    start_session, StartSessionReq(student_id=sid, chapter_id=cid)
                )
                await _ws_push_session_payload(websocket, result)
                continue

            if msg_type == "session_answer":
                sid = str(payload.get("student_id", ""))
                ans = str(payload.get("student_answer", ""))
                result = await asyncio.to_thread(
                    answer, AnswerReq(student_id=sid, student_answer=ans)
                )
                await _ws_push_answer_payload(websocket, result)
                continue

            if msg_type == "session_continue_part2":
                sid = str(payload.get("student_id", ""))
                result = await asyncio.to_thread(
                    continue_part2, ContinuePart2Req(student_id=sid)
                )
                await _ws_push_session_payload(websocket, result)
                continue

            if msg_type == "session_next_unit":
                sid = str(payload.get("student_id", ""))
                result = await asyncio.to_thread(next_unit, NextUnitReq(student_id=sid))
                await _ws_push_session_payload(websocket, result)
                continue

            if msg_type == "evaluation_summary":
                sid = str(payload.get("student_id", ""))
                summary = await asyncio.to_thread(eval_summary, sid)
                if isinstance(summary, dict):
                    await _ws_send(websocket, "evaluation_summary", summary)
                continue

            await _ws_send(websocket, "error", {"message": f"Unknown type: {msg_type}"})
    except WebSocketDisconnect:
        return