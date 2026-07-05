import json
import os
import shutil
import traceback
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..book_debug import inspect_book
from ..admin_auth import (
    ADMIN_USERNAME,
    create_admin_access_token,
    require_admin_access,
    verify_admin_credentials,
)
from ..book_registry import (
    book_dir,
    create_upload_manifest,
    get_book_record,
    list_book_records,
    set_archived,
    set_book_status,
    set_visibility,
    slug_book_id,
    sync_from_disk,
    upsert_book_record,
)
from ..chapters_service import list_units
from ..ingest_books import ingest_book_by_key
from ..database import get_db
from ..models import (
    Attendance,
    EnglishQuizAttempt,
    ExperimentSession,
    LabExperiment,
    LessonEvaluation,
    Schedule,
    StudentScheduleEnrollment,
    Subject,
    User,
)
from ..schemas import (
    AccountStatusUpdate,
    AdminAnalyticsRead,
    AdminDashboardRead,
    AdminLoginRequest,
    AdminMeRead,
    AttendanceReportItem,
    AttendanceStats,
    BookArchiveUpdate,
    BookPlanRead,
    BookPlanUpdate,
    BookRecordRead,
    BookStructureRead,
    BookStructureUpdate,
    BookVisibilityUpdate,
    EvaluationReportItem,
    EvaluationStats,
    LabReportItem,
    LabStats,
    StudentOverviewRead,
    StudentParentRead,
    StudentProgressItemRead,
    StudentQuizScoreRead,
    StudentSessionRead,
    StudentSummaryRead,
    PortalLessonRead,
    PortalModuleRead,
    SubjectBookSummary,
    SubjectContentRead,
    SubjectCreate,
    SubjectRecordRead,
    SubjectVisibilityUpdate,
    AdminPreviewSessionRequest,
    AdminPreviewSwitchPartRequest,
    AdminRegenerateLessonRequest,
    GenerateRandomScheduleResponse,
    Token,
    UserRead,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/login", response_model=Token)
async def admin_login(payload: AdminLoginRequest):
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Incorrect admin username or password")
    return Token(access_token=create_admin_access_token())


@router.get("/me", response_model=AdminMeRead)
async def admin_me(_admin: User = Depends(require_admin_access)):
    return AdminMeRead(username=ADMIN_USERNAME, role="admin", display_name="MALSY Admin")


@router.get("/dashboard", response_model=AdminDashboardRead)
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..book_registry import list_book_records, sync_from_disk

    sync_from_disk()
    students = await db.execute(select(func.count()).select_from(User).where(User.role == "student"))
    active = await db.execute(
        select(func.count()).select_from(User).where(User.role == "student", User.account_status == "Active")
    )
    books = list_book_records(include_archived=True)
    return AdminDashboardRead(
        total_students=int(students.scalar() or 0),
        active_students=int(active.scalar() or 0),
        total_books=len(books),
        visible_books=sum(1 for b in books if b.get("visible_to_students") and not b.get("archived")),
        processed_books=sum(1 for b in books if b.get("status") == "processed"),
        processing_books=sum(1 for b in books if b.get("status") == "processing"),
        failed_books=sum(1 for b in books if b.get("status") == "failed"),
        archived_books=sum(1 for b in books if b.get("archived")),
    )


@router.get("/analytics", response_model=AdminAnalyticsRead)
async def admin_analytics(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..book_registry import list_book_records, sync_from_disk

    sync_from_disk()
    grade_rows = await db.execute(
        select(User.grade_level, func.count())
        .where(User.role == "student")
        .group_by(User.grade_level)
    )
    students_by_grade = {str(g or "unknown"): c for g, c in grade_rows.all()}
    books = list_book_records(include_archived=True)
    books_by_status: dict = {}
    books_by_subject: dict = {}
    for b in books:
        books_by_status[b.get("status", "unknown")] = books_by_status.get(b.get("status", "unknown"), 0) + 1
        subj = (b.get("subject") or "other").lower()
        books_by_subject[subj] = books_by_subject.get(subj, 0) + 1
    recent = sorted(books, key=lambda x: x.get("uploaded_at") or "", reverse=True)[:8]
    recent_uploads = [
        {
            "book_id": b.get("book_id"),
            "title": b.get("title"),
            "status": b.get("status"),
            "uploaded_at": b.get("uploaded_at"),
        }
        for b in recent
    ]
    return AdminAnalyticsRead(
        students_by_grade=students_by_grade,
        books_by_status=books_by_status,
        books_by_subject=books_by_subject,
        recent_uploads=recent_uploads,
    )


@router.get("/debug/book/{book_key}")
async def debug_book_ingestion(
    book_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Temporary diagnostic: verify PDF, catalog, RAG, and schedule linkage for a book."""
    return await inspect_book(book_key, db)


# ─── Students list ───────────────────────────────────────────────────────────

@router.get("/students", response_model=List[StudentSummaryRead])
async def list_students(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..admin_student_data import student_activity_stats_batch

    rows = await db.execute(
        select(User)
        .where(User.role == "student", User.account_status == "Active")
        .order_by(User.created_at.desc())
    )
    students = list(rows.scalars().all())
    user_ids = [s.user_id for s in students]
    stats_map = await student_activity_stats_batch(db, user_ids)

    return [
        StudentSummaryRead(
            user_id=row.user_id,
            first_name=row.first_name,
            last_name=row.last_name,
            email=row.email,
            grade_level=row.grade_level,
            account_status=row.account_status,
            enrollment_count=stats_map.get(row.user_id, {}).get("scheduled_lessons_count", 0),
            subjects_assigned_count=stats_map.get(row.user_id, {}).get("subjects_assigned_count", 0),
            scheduled_lessons_count=stats_map.get(row.user_id, {}).get("scheduled_lessons_count", 0),
            completed_lessons_count=stats_map.get(row.user_id, {}).get("completed_lessons_count", 0),
            created_at=row.created_at,
        )
        for row in students
    ]


# ─── Student full overview ────────────────────────────────────────────────────

@router.get("/students/{user_id}/overview", response_model=StudentOverviewRead)
async def student_overview(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..admin_student_data import student_activity_stats

    user_result = await db.execute(select(User).where(User.user_id == user_id))
    student = user_result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")

    # Attendance stats
    att_rows = await db.execute(
        select(Attendance.attendance_status, func.count().label("cnt"))
        .where(Attendance.user_id == user_id)
        .group_by(Attendance.attendance_status)
    )
    att_counts = {row.attendance_status: row.cnt for row in att_rows.all()}
    total = sum(att_counts.values())
    present = att_counts.get("Present", 0)
    attendance = AttendanceStats(
        total=total,
        present=present,
        absent=att_counts.get("Absent", 0),
        late=att_counts.get("Late", 0),
        excused=att_counts.get("Excused", 0),
        attendance_rate=round((present / total * 100), 1) if total else 0.0,
    )

    # Evaluation stats
    eval_result = await db.execute(
        select(
            func.count(LessonEvaluation.evaluation_id).filter(LessonEvaluation.lesson_completed == True).label("completed"),
            func.avg(LessonEvaluation.overall_score).label("avg_overall"),
            func.avg(LessonEvaluation.grammar_score).label("avg_grammar"),
            func.avg(LessonEvaluation.comprehension_score).label("avg_comprehension"),
            func.avg(LessonEvaluation.pronunciation_score).label("avg_pronunciation"),
        ).where(LessonEvaluation.user_id == user_id)
    )
    ev = eval_result.one()
    evaluations = EvaluationStats(
        completed_lessons=ev.completed or 0,
        avg_overall_score=round(ev.avg_overall, 1) if ev.avg_overall else None,
        avg_grammar_score=round(ev.avg_grammar, 1) if ev.avg_grammar else None,
        avg_comprehension_score=round(ev.avg_comprehension, 1) if ev.avg_comprehension else None,
        avg_pronunciation_score=round(ev.avg_pronunciation, 1) if ev.avg_pronunciation else None,
    )

    # Lab stats
    lab_result = await db.execute(
        select(
            func.count(ExperimentSession.session_id).filter(ExperimentSession.session_status == "Completed").label("completed"),
            func.avg(ExperimentSession.final_score).label("avg_score"),
        ).where(ExperimentSession.user_id == user_id)
    )
    lb = lab_result.one()
    labs = LabStats(
        completed_sessions=lb.completed or 0,
        avg_final_score=round(lb.avg_score, 1) if lb.avg_score else None,
    )

    # Per-lesson evaluations for progress + quiz scores
    eval_rows = await db.execute(
        select(LessonEvaluation, Subject.subject_name)
        .join(Subject, Subject.subject_id == LessonEvaluation.subject_id)
        .where(LessonEvaluation.user_id == user_id)
        .order_by(LessonEvaluation.created_at.desc())
    )
    eval_by_content: dict = {}
    quiz_scores: List[StudentQuizScoreRead] = []
    progress: List[StudentProgressItemRead] = []
    for row in eval_rows.all():
        ev_row = row.LessonEvaluation
        eval_by_content[ev_row.content_id] = ev_row
        quiz_scores.append(
            StudentQuizScoreRead(
                content_id=ev_row.content_id,
                subject_name=row.subject_name,
                overall_score=ev_row.overall_score,
                grammar_score=ev_row.grammar_score,
                comprehension_score=ev_row.comprehension_score,
                pronunciation_score=ev_row.pronunciation_score,
                lesson_completed=bool(ev_row.lesson_completed),
                number_of_attempts=ev_row.number_of_attempts,
                created_at=ev_row.created_at,
            )
        )
        progress.append(
            StudentProgressItemRead(
                content_id=ev_row.content_id,
                lesson_completed=bool(ev_row.lesson_completed),
                overall_score=ev_row.overall_score,
                completion_date=ev_row.completion_date,
            )
        )

    # Enrolled book modules — same catalogs students see (not static portal curriculum).
    from ..lesson_catalog_service import modules_for_enrolled_subjects
    from ..student_portal_service import fetch_student_portal_subjects

    activity = await student_activity_stats(db, user_id)
    enrolled_modules: List[PortalModuleRead] = []
    if student.account_status == "Active":
        enrolled_subjects = await fetch_student_portal_subjects(user_id, db)
        for mod in modules_for_enrolled_subjects(enrolled_subjects):
            lessons: List[PortalLessonRead] = []
            for les in mod["lessons"]:
                cid = les["chapter_id"]
                ev_match = eval_by_content.get(cid)
                lessons.append(
                    PortalLessonRead(
                        id=les["id"],
                        name=les["name"],
                        description=les["description"],
                        chapter_id=cid,
                        completed=bool(ev_match and ev_match.lesson_completed),
                        overall_score=ev_match.overall_score if ev_match else None,
                    )
                )
            enrolled_modules.append(
                PortalModuleRead(
                    subject_key=mod["subject_key"],
                    subject_title=mod["subject_title"],
                    module_key=mod["module_key"],
                    module_title=mod["module_title"],
                    icon=mod.get("icon", ""),
                    lessons=lessons,
                )
            )

    return StudentOverviewRead(
        student=UserRead.model_validate(student),
        attendance=attendance,
        evaluations=evaluations,
        labs=labs,
        enrollment_count=activity["scheduled_lessons_count"],
        subjects_assigned_count=activity["subjects_assigned_count"],
        scheduled_lessons_count=activity["scheduled_lessons_count"],
        completed_lessons_count=activity["completed_lessons_count"],
        enrolled_modules=enrolled_modules,
        quiz_scores=quiz_scores,
        progress=progress,
    )


# ─── Attendance report ────────────────────────────────────────────────────────

@router.get("/reports/attendance", response_model=List[AttendanceReportItem])
async def attendance_report(
    subject_id: Optional[uuid.UUID] = Query(None),
    session_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    query = (
        select(Attendance, User, Subject)
        .join(User, User.user_id == Attendance.user_id)
        .join(Subject, Subject.subject_id == Attendance.subject_id)
        .order_by(Attendance.session_date.desc())
    )
    if subject_id:
        query = query.where(Attendance.subject_id == subject_id)
    if session_date:
        query = query.where(Attendance.session_date == session_date)

    rows = await db.execute(query)
    return [
        AttendanceReportItem(
            attendance_id=row.Attendance.attendance_id,
            student_name=f"{row.User.first_name} {row.User.last_name}",
            student_email=row.User.email,
            subject_name=row.Subject.subject_name,
            session_date=row.Attendance.session_date,
            attendance_status=row.Attendance.attendance_status,
            check_in_time=row.Attendance.check_in_time,
            check_out_time=row.Attendance.check_out_time,
        )
        for row in rows.all()
    ]


# ─── Evaluations report ───────────────────────────────────────────────────────

@router.get("/reports/evaluations", response_model=List[EvaluationReportItem])
async def evaluations_report(
    subject_id: Optional[uuid.UUID] = Query(None),
    completed_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    query = (
        select(LessonEvaluation, User, Subject)
        .join(User, User.user_id == LessonEvaluation.user_id)
        .join(Subject, Subject.subject_id == LessonEvaluation.subject_id)
        .order_by(LessonEvaluation.created_at.desc())
    )
    if subject_id:
        query = query.where(LessonEvaluation.subject_id == subject_id)
    if completed_only:
        query = query.where(LessonEvaluation.lesson_completed == True)

    rows = await db.execute(query)
    return [
        EvaluationReportItem(
            evaluation_id=row.LessonEvaluation.evaluation_id,
            student_name=f"{row.User.first_name} {row.User.last_name}",
            student_email=row.User.email,
            subject_name=row.Subject.subject_name,
            content_id=row.LessonEvaluation.content_id,
            overall_score=row.LessonEvaluation.overall_score,
            lesson_completed=row.LessonEvaluation.lesson_completed,
            created_at=row.LessonEvaluation.created_at,
        )
        for row in rows.all()
    ]


# ─── Labs report ──────────────────────────────────────────────────────────────

@router.get("/reports/labs", response_model=List[LabReportItem])
async def labs_report(
    completed_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    query = (
        select(ExperimentSession, User, LabExperiment)
        .join(User, User.user_id == ExperimentSession.user_id)
        .join(LabExperiment, LabExperiment.experiment_id == ExperimentSession.experiment_id)
        .order_by(ExperimentSession.start_time.desc())
    )
    if completed_only:
        query = query.where(ExperimentSession.session_status == "Completed")

    rows = await db.execute(query)
    return [
        LabReportItem(
            session_id=row.ExperimentSession.session_id,
            student_name=f"{row.User.first_name} {row.User.last_name}",
            student_email=row.User.email,
            experiment_name=row.LabExperiment.experiment_name,
            session_status=row.ExperimentSession.session_status,
            final_score=row.ExperimentSession.final_score,
            observation_accuracy=row.ExperimentSession.observation_accuracy,
            procedure_completion=row.ExperimentSession.procedure_completion,
            start_time=row.ExperimentSession.start_time,
            end_time=row.ExperimentSession.end_time,
        )
        for row in rows.all()
    ]


# ─── Change account status ────────────────────────────────────────────────────

@router.patch("/users/{user_id}/status", response_model=UserRead)
async def update_account_status(
    user_id: uuid.UUID,
    payload: AccountStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    allowed = {"Active", "Inactive", "Suspended"}
    if payload.account_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed}")

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.account_status = payload.account_status
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/students/{user_id}", response_model=StudentOverviewRead)
async def get_student_detail(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    return await student_overview(user_id, db, _admin)


@router.patch("/students/{user_id}/deactivate", response_model=UserRead)
async def deactivate_student(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    """Deactivate a student account without deleting progress data."""
    result = await db.execute(select(User).where(User.user_id == user_id, User.role == "student"))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")
    user.account_status = "Inactive"
    await db.commit()
    await db.refresh(user)
    return user


async def _student_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.user_id == user_id, User.role == "student"))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.get("/students/{user_id}/parents", response_model=StudentParentRead)
async def student_parents(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..admin_student_data import parent_info_from_user

    student = await _student_or_404(db, user_id)
    return StudentParentRead(**parent_info_from_user(student))


@router.get("/students/{user_id}/schedule", response_model=List[StudentSessionRead])
async def student_schedule(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..admin_student_data import build_student_schedule

    await _student_or_404(db, user_id)
    rows = await build_student_schedule(db, user_id)
    return [StudentSessionRead(**r) for r in rows]


@router.get("/students/{user_id}/attendance", response_model=List[StudentSessionRead])
async def student_attendance(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    from ..admin_student_data import build_student_attendance_sessions

    await _student_or_404(db, user_id)
    rows = await build_student_attendance_sessions(db, user_id)
    return [StudentSessionRead(**r) for r in rows]


@router.delete("/students/{user_id}", status_code=204)
async def delete_student_account(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    """Soft-delete: deactivate account and preserve all progress records."""
    result = await db.execute(select(User).where(User.user_id == user_id, User.role == "student"))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")
    user.account_status = "Inactive"
    await db.commit()


@router.get("/curriculum/portal")
async def admin_portal_curriculum(_admin: User = Depends(require_admin_access)):
    """Book-based curriculum modules (same lesson lists as student /books/{id}/lessons)."""
    from ..lesson_catalog_service import portal_modules_from_books
    from ..portal_curriculum import portal_modules

    modules = portal_modules_from_books()
    if not modules:
        modules = portal_modules()
    return {"modules": modules, "source": "book_catalog" if modules else "portal_curriculum"}


@router.get("/curriculum/english")
async def admin_english_curriculum(_admin: User = Depends(require_admin_access)):
    """English book module — same uploaded lessons students see."""
    from ..lesson_catalog_service import english_book_module_for_portal

    mod = english_book_module_for_portal()
    return {"modules": [mod] if mod else [], "source": "book_catalog"}


@router.get("/lessons/content")
async def admin_lesson_content_query(
    chapter_id: str = Query(..., description="e.g. english_grammar:unit_01"),
    student_id: Optional[str] = Query(None),
    module_key: Optional[str] = Query(None, description="English module key for book-skill view"),
    _admin: User = Depends(require_admin_access),
):
    """Read stored lesson content without regenerating."""
    from ..admin_lesson_content import get_admin_lesson_content

    if not chapter_id.strip():
        raise HTTPException(status_code=400, detail="chapter_id is required")
    return get_admin_lesson_content(chapter_id.strip(), student_id=student_id, module_key=module_key)


@router.get("/lessons/{lesson_id:path}/content")
async def admin_lesson_content_by_id(
    lesson_id: str,
    student_id: Optional[str] = Query(None),
    module_key: Optional[str] = Query(None, description="English module key for book-skill view"),
    _admin: User = Depends(require_admin_access),
):
    """Read stored lesson content by lesson/chapter id (path param)."""
    from ..admin_lesson_content import get_admin_lesson_content

    chapter_id = lesson_id.strip()
    if not chapter_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")
    return get_admin_lesson_content(chapter_id, student_id=student_id, module_key=module_key)


@router.post("/lessons/{lesson_id:path}/preview-session")
async def admin_start_preview_session(
    lesson_id: str,
    payload: AdminPreviewSessionRequest = AdminPreviewSessionRequest(),
    _admin: User = Depends(require_admin_access),
):
    """Generate lesson content via the same graph as students — no progress writes."""
    from ..admin_preview_service import start_admin_preview_session

    chapter_id = lesson_id.strip()
    if not chapter_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")
    try:
        return start_admin_preview_session(
            chapter_id,
            lesson_title=payload.lesson_title,
            lesson_desc=payload.lesson_desc,
            unit_part=payload.unit_part,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/lessons/{lesson_id:path}/preview-session/switch-part")
async def admin_switch_preview_part(
    lesson_id: str,
    payload: AdminPreviewSwitchPartRequest,
    _admin: User = Depends(require_admin_access),
):
    from ..admin_preview_service import switch_admin_preview_part

    chapter_id = lesson_id.strip()
    if not chapter_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")
    try:
        return switch_admin_preview_part(chapter_id, payload.unit_part)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/lessons/{lesson_id:path}/preview-quiz")
async def admin_preview_quiz(
    lesson_id: str,
    unit_part: int = Query(0, ge=0),
    lesson_title: str = Query(""),
    lesson_desc: str = Query(""),
    _admin: User = Depends(require_admin_access),
):
    """Generated quiz for one lesson part (includes correct answers)."""
    from ..admin_preview_service import get_admin_preview_quiz

    chapter_id = lesson_id.strip()
    if not chapter_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")
    try:
        return get_admin_preview_quiz(
            chapter_id,
            unit_part=unit_part,
            lesson_title=lesson_title,
            lesson_desc=lesson_desc,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/lessons/{lesson_id:path}/regenerate")
async def admin_regenerate_lesson(
    lesson_id: str,
    payload: AdminRegenerateLessonRequest = AdminRegenerateLessonRequest(),
    _admin: User = Depends(require_admin_access),
):
    """Regenerate one lesson's AI content without touching student progress."""
    from ..admin_preview_service import regenerate_admin_lesson

    chapter_id = lesson_id.strip()
    if not chapter_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")
    try:
        return regenerate_admin_lesson(
            chapter_id,
            lesson_title=payload.lesson_title,
            lesson_desc=payload.lesson_desc,
            unit_part=payload.unit_part,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/units/{unit_id:path}/listening")
async def admin_get_listening(
    unit_id: str,
    _admin: User = Depends(require_admin_access),
):
    """Full listening activity preview for Admin Dashboard (includes answers)."""
    from ..listening_store import load_listening

    activity = load_listening(unit_id)
    if not activity:
        raise HTTPException(status_code=404, detail="No listening activity for this unit")
    return activity


# ─── Books (upload, process, visibility) ─────────────────────────────────────

def _chroma_counts(book_id: str) -> dict:
    try:
        from ..db import get_chroma_client

        client = get_chroma_client("chroma_db")
        unit_count = chunk_count = 0
        col = client.get_or_create_collection("units")
        data = col.get(where={"book_id": book_id})
        unit_count = len(data.get("ids") or [])
        col = client.get_or_create_collection("pdf_chunks")
        data = col.get(where={"book_id": book_id})
        chunk_count = len(data.get("ids") or [])
        return {"unit_count": unit_count, "chunk_count": chunk_count}
    except Exception:
        return {"unit_count": 0, "chunk_count": 0}


from ..book_lesson_counts import (
    merge_book_lesson_counts,
    structure_counts_from_manifest as _structure_counts_from_manifest,
)


def _merge_book_counts(rec: dict, manifest: Optional[dict] = None) -> dict:
    """Prefer registry/manifest structure counts; use Chroma only for chunk_count."""
    chroma = _chroma_counts(rec.get("book_id", ""))
    out = merge_book_lesson_counts(rec, manifest)
    out["chunk_count"] = chroma.get("chunk_count") or rec.get("chunk_count")
    return out


def _book_to_read(rec: dict) -> BookRecordRead:
    from ..book_registry import book_processing_pipeline

    structure_status = rec.get("structure_status")
    if not structure_status and rec.get("status") == "processed":
        structure_status = "approved"

    return BookRecordRead(
        book_id=rec.get("book_id", ""),
        title=rec.get("title") or rec.get("book_id", ""),
        subject=rec.get("subject") or "",
        grade=int(rec.get("grade") or 6),
        status=rec.get("status") or "uploaded",
        visible_to_students=bool(rec.get("visible_to_students")),
        archived=bool(rec.get("archived")),
        pdf_filename=rec.get("pdf_filename"),
        uploaded_at=rec.get("uploaded_at"),
        processed_at=rec.get("processed_at"),
        error_message=rec.get("error_message"),
        unit_count=rec.get("unit_count"),
        lesson_count=rec.get("lesson_count"),
        chunk_count=rec.get("chunk_count"),
        plan_status=rec.get("plan_status"),
        plan_generated_at=rec.get("plan_generated_at"),
        plan_approved_at=rec.get("plan_approved_at"),
        plan_error=rec.get("plan_error"),
        schedule_in_student_portal=bool(rec.get("schedule_in_student_portal")),
        schedule_sync_at=rec.get("schedule_sync_at"),
        schedule_students_affected=rec.get("schedule_students_affected"),
        schedule_entries_created=rec.get("schedule_entries_created"),
        processing=book_processing_pipeline({**rec, "structure_status": structure_status}),
        structure_status=structure_status,
        structure_warning=rec.get("structure_warning"),
        structure_detection_method=rec.get("structure_detection_method"),
        structure_extracted_at=rec.get("structure_extracted_at"),
        structure_approved_at=rec.get("structure_approved_at"),
    )


def _run_structure_extraction_job(book_id: str) -> None:
    try:
        from ..unit_detection import run_structure_extraction

        run_structure_extraction(book_id, force=True)
    except Exception as exc:
        traceback.print_exc()
        from ..book_registry import upsert_book_record

        upsert_book_record(
            book_id,
            structure_status="pending",
            status="failed",
            error_message=f"Structure extraction failed: {exc}",
        )


def _run_ingest_job(book_id: str, *, skip_structure_check: bool = False) -> None:
    try:
        from ..book_registry import is_structure_approved

        if not skip_structure_check and not is_structure_approved(book_id):
            raise ValueError("Approve the extracted book structure before processing")

        set_book_status(book_id, "processing")
        from ..unit_detection import refresh_manifest_units_from_pdf
        from ..canonical_plan_store import load_book_plan

        refresh_manifest_units_from_pdf(book_id)
        result = ingest_book_by_key(book_id, purge=True)
        counts = _chroma_counts(book_id)
        ingested_lessons = int(result.get("units_ingested") or 0)
        manifest_path = os.path.join(book_dir(book_id), "manifest.json")
        manifest = None
        if os.path.isfile(manifest_path):
            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)
        structure = _structure_counts_from_manifest(manifest)
        upsert_book_record(
            book_id,
            status="processed",
            unit_count=structure["unit_count"] or ingested_lessons,
            lesson_count=structure["lesson_count"] or ingested_lessons,
            chunk_count=counts["chunk_count"] or result.get("chunks_written"),
            error_message=None,
        )

        try:
            from ..book_lessons_catalog import sync_lessons_catalog_from_manifest
            from ..lesson_content_mapping import ensure_book_ready_for_students

            ensure_book_ready_for_students(book_id)
        except Exception:
            traceback.print_exc()

        rec = get_book_record(book_id) or {}
        plan_status = rec.get("plan_status")
        plan = load_book_plan(book_id)
        stale_plan = False
        if plan:
            from ..lesson_content_mapping import plan_is_stale

            stale_plan = plan_is_stale(book_id, plan)
        if stale_plan:
            upsert_book_record(book_id, plan_status=None, plan_error=None)

        _run_plan_generation_job(book_id)
    except Exception as exc:
        traceback.print_exc()
        set_book_status(book_id, "failed", error_message=str(exc))


def _run_plan_generation_job(book_id: str, *, force: bool = False) -> None:
    from ..book_plan_service import generate_book_lesson_plan

    try:
        generate_book_lesson_plan(book_id, force=force)
    except Exception as exc:
        traceback.print_exc()
        upsert_book_record(book_id, plan_status="failed", plan_error=str(exc))


def _run_schedule_sync_job(book_id: str) -> None:
    from ..schedule_sync_service import run_schedule_sync_for_book

    try:
        result = run_schedule_sync_for_book(book_id)
        print(f"[schedule-sync] book={book_id} result={result}")
    except Exception:
        traceback.print_exc()
    _run_lesson_schedule_generation_job(append_missing=True)


def _run_lesson_schedule_generation_job(
    *,
    force: bool = False,
    append_missing: bool = False,
    user_id: Optional[str] = None,
) -> None:
    from ..lesson_schedule_service import run_lesson_schedule_generation

    try:
        result = run_lesson_schedule_generation(
            force=force,
            append_missing=append_missing,
            user_id=user_id,
        )
        print(f"[lesson-schedule] generation result={result}")
    except Exception:
        traceback.print_exc()


def _run_schedule_sync_subject_job(subject_key: str) -> None:
    from ..schedule_sync_service import run_schedule_sync_for_subject

    try:
        results = run_schedule_sync_for_subject(subject_key)
        print(f"[schedule-sync] subject={subject_key} results={results}")
    except Exception:
        traceback.print_exc()
    _run_lesson_schedule_generation_job(append_missing=True)


@router.get("/books", response_model=List[BookRecordRead])
async def admin_list_books(_admin: User = Depends(require_admin_access)):
    sync_from_disk()
    return [_book_to_read(b) for b in list_book_records(include_archived=True)]


def _subject_book_summary(rec: Optional[dict]) -> Optional[SubjectBookSummary]:
    if not rec:
        return None
    return SubjectBookSummary(
        book_id=rec.get("book_id"),
        title=rec.get("title"),
        status=rec.get("status"),
        visible_to_students=bool(rec.get("visible_to_students")),
        archived=bool(rec.get("archived")),
        unit_count=rec.get("unit_count"),
        chunk_count=rec.get("chunk_count"),
        error_message=rec.get("error_message"),
        uploaded_at=rec.get("uploaded_at"),
        plan_status=rec.get("plan_status"),
    )


@router.get("/content/subjects", response_model=List[SubjectContentRead])
async def admin_subject_content(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_access),
):
    """Subject-based Student Content cards — metadata only, no RAG."""
    return await _build_subject_content_cards(db)


async def _build_subject_content_cards(db: AsyncSession) -> List[SubjectContentRead]:
    from ..book_registry import books_for_subject, get_primary_book, sync_from_disk
    from ..subject_registry import list_subject_records

    sync_from_disk()

    schedule_rows = await db.execute(
        select(Subject.subject_name, func.count(Schedule.schedule_id))
        .join(Schedule, Schedule.subject_id == Subject.subject_id)
        .where(Schedule.is_active == True)
        .group_by(Subject.subject_name)
    )
    sessions_by_name = {row[0].lower(): int(row[1]) for row in schedule_rows.all()}

    def session_count_for(subject_key: str, subject_name: str) -> int:
        if subject_key == "english":
            return sessions_by_name.get("english", 0)
        if subject_key == "history":
            return sessions_by_name.get("history", 0)
        if subject_key == "science":
            return sessions_by_name.get("science", 0) or sessions_by_name.get("chemistry", 0)
        return sessions_by_name.get(subject_name.lower(), 0) or sessions_by_name.get(subject_key, 0)

    cards: List[SubjectContentRead] = []
    for subj in list_subject_records(include_archived=True):
        key = subj["subject_key"]
        books = books_for_subject(key, include_archived=True)
        grade = int(subj.get("grade") or 6)
        primary = get_primary_book(key, grade=grade)
        if primary:
            manifest_path = os.path.join(book_dir(primary.get("book_id", "")), "manifest.json")
            manifest = None
            if os.path.isfile(manifest_path):
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
            primary = _merge_book_counts(primary, manifest)
        lesson_count = 0
        if primary:
            lesson_count = int(primary.get("lesson_count") or primary.get("unit_count") or 0)
        elif books:
            lesson_count = int(books[0].get("unit_count") or 0)

        cards.append(
            SubjectContentRead(
                subject_key=key,
                subject_name=subj.get("subject_name") or key,
                icon=subj.get("icon") or "📚",
                grade=grade,
                student_session_count=session_count_for(key, subj.get("subject_name") or key),
                generated_lesson_count=lesson_count,
                uploaded_book_count=len(books),
                has_book=bool(primary or books),
                book=_subject_book_summary(primary),
                books=[b for b in (_subject_book_summary(x) for x in books) if b],
                visible_to_students=bool(subj.get("visible_to_students", True)),
                archived=bool(subj.get("archived", False)),
                builtin=bool(subj.get("builtin", False)),
            )
        )
    return cards


def _subject_record_read(subject_key: str) -> SubjectRecordRead:
    from ..book_registry import get_primary_book
    from ..subject_registry import get_subject_record

    subj = get_subject_record(subject_key)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")
    grade = int(subj.get("grade") or 6)
    primary = get_primary_book(subject_key, grade=grade)
    if primary:
        manifest_path = os.path.join(book_dir(primary.get("book_id", "")), "manifest.json")
        manifest = None
        if os.path.isfile(manifest_path):
            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)
        primary = _merge_book_counts(primary, manifest)
    return SubjectRecordRead(
        subject_key=subj["subject_key"],
        subject_name=subj.get("subject_name") or subj["subject_key"],
        icon=subj.get("icon") or "📚",
        grade=grade,
        visible_to_students=bool(subj.get("visible_to_students", False)),
        archived=bool(subj.get("archived", False)),
        builtin=bool(subj.get("builtin", False)),
        created_at=subj.get("created_at"),
        book=_subject_book_summary(primary),
    )


@router.get("/subjects", response_model=List[SubjectRecordRead])
async def admin_list_subjects(_admin: User = Depends(require_admin_access)):
    from ..subject_registry import list_subject_records

    sync_from_disk()
    return [_subject_record_read(s["subject_key"]) for s in list_subject_records(include_archived=True)]


@router.post("/subjects", response_model=SubjectRecordRead, status_code=201)
async def admin_create_subject(
    payload: SubjectCreate,
    _admin: User = Depends(require_admin_access),
):
    from ..subject_registry import create_subject

    name = (payload.subject_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="subject_name is required")
    try:
        create_subject(
            subject_name=name,
            grade=int(payload.grade),
            icon=payload.icon or "📚",
            visible_to_students=bool(payload.visible_to_students),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from ..subject_registry import slug_subject_key

    return _subject_record_read(slug_subject_key(name))


@router.patch("/subjects/{subject_key}/visibility", response_model=SubjectRecordRead)
async def admin_set_subject_visibility(
    subject_key: str,
    payload: SubjectVisibilityUpdate,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    from ..subject_registry import set_subject_visibility

    try:
        set_subject_visibility(subject_key, payload.visible_to_students)
    except KeyError:
        raise HTTPException(status_code=404, detail="Subject not found")
    if payload.visible_to_students:
        background_tasks.add_task(_run_schedule_sync_subject_job, subject_key)
    return _subject_record_read(subject_key)


@router.patch("/subjects/{subject_key}/archive", response_model=SubjectRecordRead)
async def admin_set_subject_archive(
    subject_key: str,
    payload: BookArchiveUpdate,
    _admin: User = Depends(require_admin_access),
):
    from ..book_registry import books_for_subject, set_archived
    from ..subject_registry import set_subject_archived

    try:
        set_subject_archived(subject_key, payload.archived)
    except KeyError:
        raise HTTPException(status_code=404, detail="Subject not found")
    if payload.archived:
        for book in books_for_subject(subject_key, include_archived=True):
            bid = book.get("book_id")
            if bid:
                try:
                    set_archived(bid, True)
                except KeyError:
                    pass
    return _subject_record_read(subject_key)


def _admin_save_uploaded_book(
    *,
    book_id: str,
    title: str,
    subject_key: str,
    grade: int,
    visible_to_students: bool,
    replace: bool,
    file: UploadFile,
) -> dict:
    from ..book_registry import canonical_book_id

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    if os.path.isdir(book_dir(book_id)) and not replace:
        replace = True

    dest_dir = book_dir(book_id)
    os.makedirs(dest_dir, exist_ok=True)
    pdf_filename = "book.pdf"
    with open(os.path.join(dest_dir, pdf_filename), "wb") as out:
        shutil.copyfileobj(file.file, out)

    manifest = create_upload_manifest(
        book_id,
        title=title.strip(),
        subject=subject_key,
        grade=int(grade),
        pdf_filename=pdf_filename,
    )
    with open(os.path.join(dest_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return upsert_book_record(
        book_id,
        title=title.strip(),
        subject=subject_key,
        grade=int(grade),
        status="uploaded",
        visible_to_students=False,
        archived=False,
        pending_visibility=bool(visible_to_students),
        pdf_filename=pdf_filename,
        uploaded_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        unit_count=len(manifest.get("units") or []),
        chunk_count=0,
        error_message=None,
        structure_status="pending",
        structure_warning=None,
        book_key=book_id,
        catalog_key=book_id,
    )


@router.post("/subjects/{subject_key}/upload-book", response_model=BookRecordRead)
async def admin_upload_subject_book(
    subject_key: str,
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    grade: int = Form(...),
    visible_to_students: bool = Form(False),
    process_now: bool = Form(True),
    replace: bool = Form(False),
    file: UploadFile = File(...),
    _admin: User = Depends(require_admin_access),
):
    from ..book_registry import canonical_book_id, normalize_subject_key
    from ..subject_registry import get_subject_record

    sync_from_disk()
    subj = get_subject_record(subject_key)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")

    norm = normalize_subject_key(subject_key) or subject_key.strip().lower()
    book_id = canonical_book_id(norm, int(grade))
    rec = _admin_save_uploaded_book(
        book_id=book_id,
        title=title,
        subject_key=norm,
        grade=int(grade),
        visible_to_students=visible_to_students,
        replace=replace,
        file=file,
    )

    if process_now:
        background_tasks.add_task(_run_structure_extraction_job, book_id)
        rec = upsert_book_record(book_id, structure_status="extracting")

    if visible_to_students and rec.get("status") == "processed":
        rec = set_visibility(book_id, True)

    return _book_to_read(rec)


@router.post("/books/upload", response_model=BookRecordRead)
async def admin_upload_book(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    subject: str = Form(...),
    grade: int = Form(...),
    visible_to_students: bool = Form(False),
    process_now: bool = Form(True),
    replace: bool = Form(False),
    file: UploadFile = File(...),
    _admin: User = Depends(require_admin_access),
):
    from ..book_registry import canonical_book_id, normalize_subject_key

    sync_from_disk()
    subject_key = normalize_subject_key(subject) or subject.strip().lower()
    book_id = canonical_book_id(subject_key, int(grade))

    rec = _admin_save_uploaded_book(
        book_id=book_id,
        title=title,
        subject_key=subject_key,
        grade=int(grade),
        visible_to_students=visible_to_students,
        replace=replace,
        file=file,
    )

    if process_now:
        background_tasks.add_task(_run_structure_extraction_job, book_id)
        rec = upsert_book_record(book_id, structure_status="extracting")

    if visible_to_students and rec.get("status") == "processed":
        rec = set_visibility(book_id, True)

    return _book_to_read(rec)


def _structure_read(book_id: str, rec: dict, manifest: Optional[dict]) -> BookStructureRead:
    manifest = manifest or {}
    meta = manifest.get("structure") or {}
    structure_status = rec.get("structure_status")
    if not structure_status and rec.get("status") == "processed":
        structure_status = "approved"
    return BookStructureRead(
        book_id=book_id,
        title=rec.get("title") or manifest.get("title") or book_id,
        subject=rec.get("subject") or manifest.get("subject") or "",
        grade=int(rec.get("grade") or manifest.get("grade") or 6),
        structure_status=structure_status,
        structure_warning=rec.get("structure_warning") or meta.get("warning"),
        structure_detection_method=rec.get("structure_detection_method") or meta.get("detection_method"),
        page_count=meta.get("page_count"),
        units=manifest.get("units") or [],
    )


@router.get("/books/{book_id}/structure", response_model=BookStructureRead)
async def admin_get_book_structure(book_id: str, _admin: User = Depends(require_admin_access)):
    sync_from_disk()
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    manifest = None
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    return _structure_read(book_id, rec, manifest)


@router.post("/books/{book_id}/extract-structure", response_model=BookStructureRead)
async def admin_extract_book_structure(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if not os.path.isdir(book_dir(book_id)):
        raise HTTPException(status_code=400, detail="Book files missing on disk")
    background_tasks.add_task(_run_structure_extraction_job, book_id)
    rec = upsert_book_record(book_id, structure_status="extracting")
    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    manifest = None
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    return _structure_read(book_id, rec, manifest)


@router.patch("/books/{book_id}/structure", response_model=BookStructureRead)
async def admin_update_book_structure(
    book_id: str,
    payload: BookStructureUpdate,
    _admin: User = Depends(require_admin_access),
):
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if rec.get("structure_status") not in ("draft", "approved", "extracting", "pending", None):
        pass
    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=400, detail="Manifest missing")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    by_id = {u.unit_id: u for u in payload.units}
    updated_units = []
    for existing in manifest.get("units") or []:
        uid = existing.get("unit_id")
        patch = by_id.get(uid)
        if not patch:
            updated_units.append(existing)
            continue
        merged = {**existing}
        if patch.title is not None:
            merged["title"] = patch.title.strip()
        if patch.start_page is not None:
            merged["start_page"] = patch.start_page
        if patch.end_page is not None:
            merged["end_page"] = patch.end_page
        if patch.lessons is not None:
            existing_lessons = existing.get("lessons") or []
            merged_lessons = []
            for i, les in enumerate(patch.lessons):
                base = dict(existing_lessons[i]) if i < len(existing_lessons) else {}
                base["lesson_id"] = les.lesson_id
                if les.title is not None:
                    base["title"] = les.title.strip()
                if les.start_page is not None:
                    base["start_page"] = les.start_page
                if les.end_page is not None:
                    base["end_page"] = les.end_page
                merged_lessons.append(base)
            merged["lessons"] = merged_lessons
        updated_units.append(merged)

    manifest["units"] = updated_units
    manifest.setdefault("structure", {})["admin_edited"] = True
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    rec = upsert_book_record(
        book_id,
        unit_count=len(updated_units),
        structure_status="draft" if rec.get("structure_status") != "approved" else "draft",
    )
    return _structure_read(book_id, rec, manifest)


@router.post("/books/{book_id}/structure/approve", response_model=BookRecordRead)
async def admin_approve_book_structure(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    from ..unit_detection import approve_and_prepare_manifest

    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=400, detail="Manifest missing")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    if not (manifest.get("units") or []):
        raise HTTPException(status_code=400, detail="No units to approve")

    approve_and_prepare_manifest(book_id, manifest)
    background_tasks.add_task(_run_ingest_job, book_id, skip_structure_check=True)
    rec = set_book_status(book_id, "processing")
    return _book_to_read(rec)


@router.get("/books/{book_id}")
async def admin_get_book(book_id: str, _admin: User = Depends(require_admin_access)):
    sync_from_disk()
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")

    manifest_path = os.path.join(book_dir(book_id), "manifest.json")
    manifest = None
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)

    rec = _merge_book_counts(rec, manifest)
    units = [u for u in list_units(student_visible_only=False) if u.get("book_id") == book_id]

    # Drop stale Chroma units not in the current manifest (leftover from old ingests).
    if manifest:
        from ..unit_detection import full_unit_id, normalize_manifest_unit_id

        allowed: set[str] = set()
        for u in manifest.get("units") or []:
            short = normalize_manifest_unit_id(u.get("unit_id", ""), book_id)
            allowed.add(full_unit_id(book_id, short))
            allowed.add(short)
            allowed.add(f"{book_id}:{short}")
        units = [u for u in units if u.get("unit_id") in allowed]

    lessons = None
    lessons_path = os.path.join(book_dir(book_id), "lessons.json")
    if os.path.isfile(lessons_path):
        with open(lessons_path, encoding="utf-8") as f:
            lessons = json.load(f)

    return {"book": _book_to_read(rec), "units": units, "manifest": manifest, "lessons": lessons}


@router.post("/books/{book_id}/process", response_model=BookRecordRead)
async def admin_process_book(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if not os.path.isdir(book_dir(book_id)):
        raise HTTPException(status_code=400, detail="Book files missing on disk")

    from ..book_registry import is_structure_approved

    if rec.get("status") == "processed":
        background_tasks.add_task(_run_ingest_job, book_id, True)
    elif rec.get("structure_status") == "draft":
        raise HTTPException(
            status_code=400,
            detail="Approve the extracted book structure before processing. Use Approve & Publish on the structure review.",
        )
    elif rec.get("structure_status") == "extracting":
        raise HTTPException(status_code=400, detail="Structure extraction is still in progress.")
    elif not is_structure_approved(book_id):
        raise HTTPException(
            status_code=400,
            detail="Extract and approve the book structure before processing.",
        )
    else:
        background_tasks.add_task(_run_ingest_job, book_id, True)

    rec = set_book_status(book_id, "processing")
    return _book_to_read(rec)


@router.patch("/books/{book_id}/visibility", response_model=BookRecordRead)
async def admin_set_visibility(
    book_id: str,
    payload: BookVisibilityUpdate,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    try:
        rec = set_visibility(book_id, payload.visible_to_students)
    except KeyError:
        raise HTTPException(status_code=404, detail="Book not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if payload.visible_to_students:
        background_tasks.add_task(_run_schedule_sync_job, book_id)
    return _book_to_read(rec)


@router.patch("/books/{book_id}/archive", response_model=BookRecordRead)
async def admin_set_archive(
    book_id: str,
    payload: BookArchiveUpdate,
    _admin: User = Depends(require_admin_access),
):
    try:
        rec = set_archived(book_id, payload.archived)
    except KeyError:
        raise HTTPException(status_code=404, detail="Book not found")
    return _book_to_read(rec)


@router.get("/books/{book_id}/plans", response_model=BookPlanRead)
async def admin_get_book_plan(book_id: str, _admin: User = Depends(require_admin_access)):
    from ..book_plan_service import get_admin_plan_view

    sync_from_disk()
    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    return BookPlanRead(**get_admin_plan_view(book_id))


@router.patch("/books/{book_id}/plans", response_model=BookPlanRead)
async def admin_update_book_plan(
    book_id: str,
    payload: BookPlanUpdate,
    _admin: User = Depends(require_admin_access),
):
    from ..book_plan_service import get_admin_plan_view, update_book_plan_units

    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if rec.get("plan_status") == "approved":
        raise HTTPException(status_code=400, detail="Cannot edit an approved plan — regenerate first")
    try:
        update_book_plan_units(book_id, [u.model_dump(exclude_none=True) for u in payload.units])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return BookPlanRead(**get_admin_plan_view(book_id))


@router.patch("/books/{book_id}/plans/approve", response_model=BookPlanRead)
async def admin_approve_book_plan(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    from ..book_plan_service import approve_book_plan, get_admin_plan_view

    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    try:
        approve_book_plan(book_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    background_tasks.add_task(_run_schedule_sync_job, book_id)
    return BookPlanRead(**get_admin_plan_view(book_id))


@router.post("/books/{book_id}/plans/generate", response_model=BookPlanRead)
async def admin_generate_book_plan(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    from ..book_plan_service import get_admin_plan_view

    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if rec.get("status") != "processed":
        raise HTTPException(status_code=400, detail="Book must be processed before generating a plan")
    plan_status = rec.get("plan_status")
    if plan_status == "approved":
        raise HTTPException(status_code=400, detail="Plan already approved — use Regenerate to replace it")
    if plan_status == "draft":
        raise HTTPException(status_code=400, detail="Draft plan exists — approve it or use Regenerate")
    if plan_status == "generating":
        raise HTTPException(status_code=400, detail="Plan generation already in progress")
    upsert_book_record(book_id, plan_status="generating", plan_error=None)
    background_tasks.add_task(_run_plan_generation_job, book_id, force=False)
    return BookPlanRead(**get_admin_plan_view(book_id))


@router.post("/books/{book_id}/plans/regenerate", response_model=BookPlanRead)
async def admin_regenerate_book_plan(
    book_id: str,
    background_tasks: BackgroundTasks,
    _admin: User = Depends(require_admin_access),
):
    from ..book_plan_service import get_admin_plan_view

    rec = get_book_record(book_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Book not found")
    if rec.get("status") != "processed":
        raise HTTPException(status_code=400, detail="Book must be processed before generating a plan")
    upsert_book_record(book_id, plan_status="generating", visible_to_students=False)
    background_tasks.add_task(_run_plan_generation_job, book_id, force=True)
    return BookPlanRead(**get_admin_plan_view(book_id))


@router.post("/schedules/generate-random", response_model=GenerateRandomScheduleResponse)
async def admin_generate_random_lesson_schedules(
    force: bool = Query(False, description="Replace non-completed schedule items"),
    _admin: User = Depends(require_admin_access),
    db: AsyncSession = Depends(get_db),
):
    """
    Build a randomized sequential lesson order for every active student.
    Skips students who already have a schedule unless force=true.
    """
    from ..lesson_schedule_service import generate_lesson_schedules_for_all_students

    summary = await generate_lesson_schedules_for_all_students(db, force=force, append_missing=False)
    await db.commit()
    return GenerateRandomScheduleResponse(**summary)
