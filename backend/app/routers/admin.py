import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..database import get_db
from ..models import (
    Attendance,
    EnglishQuizAttempt,
    ExperimentSession,
    LabExperiment,
    LessonEvaluation,
    StudentScheduleEnrollment,
    Subject,
    User,
)
from ..schemas import (
    AccountStatusUpdate,
    AttendanceReportItem,
    AttendanceStats,
    EvaluationReportItem,
    EvaluationStats,
    LabReportItem,
    LabStats,
    StudentOverviewRead,
    StudentSummaryRead,
    UserRead,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── Students list ───────────────────────────────────────────────────────────

@router.get("/students", response_model=List[StudentSummaryRead])
async def list_students(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = await db.execute(
        select(
            User,
            func.count(StudentScheduleEnrollment.enrollment_id).label("enrollment_count"),
        )
        .outerjoin(
            StudentScheduleEnrollment,
            (StudentScheduleEnrollment.user_id == User.user_id)
            & (StudentScheduleEnrollment.enrollment_status == "Active"),
        )
        .where(User.role == "student")
        .group_by(User.user_id)
        .order_by(User.created_at.desc())
    )
    return [
        StudentSummaryRead(
            user_id=row.User.user_id,
            first_name=row.User.first_name,
            last_name=row.User.last_name,
            email=row.User.email,
            grade_level=row.User.grade_level,
            account_status=row.User.account_status,
            enrollment_count=row.enrollment_count,
            created_at=row.User.created_at,
        )
        for row in rows.all()
    ]


# ─── Student full overview ────────────────────────────────────────────────────

@router.get("/students/{user_id}/overview", response_model=StudentOverviewRead)
async def student_overview(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user_result = await db.execute(select(User).where(User.user_id == user_id))
    student = user_result.scalar_one_or_none()
    if not student:
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

    return StudentOverviewRead(
        student=UserRead.model_validate(student),
        attendance=attendance,
        evaluations=evaluations,
        labs=labs,
    )


# ─── Attendance report ────────────────────────────────────────────────────────

@router.get("/reports/attendance", response_model=List[AttendanceReportItem])
async def attendance_report(
    subject_id: Optional[uuid.UUID] = Query(None),
    session_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
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
    _admin: User = Depends(require_admin),
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
    _admin: User = Depends(require_admin),
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
    _admin: User = Depends(require_admin),
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
