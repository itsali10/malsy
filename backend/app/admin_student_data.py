"""Admin helpers for student parent info, schedule, and attendance."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Attendance, LessonEvaluation, Schedule, StudentLessonScheduleItem, StudentScheduleEnrollment, Subject, User
from .portal_curriculum import find_lesson_meta
from .weekly_schedule_planner import DAY_ORDER, sunday_of_week


def _time_str(t: Optional[time]) -> Optional[str]:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _module_for_slot(subject_name: str, day_of_week: str, start_time: time, session_type: str) -> str:
    """Legacy timetable label — used only for attendance history rows."""
    return session_type or subject_name


def _eval_for_lesson(evals: Dict[str, LessonEvaluation], lesson_id: str) -> Optional[LessonEvaluation]:
    if not lesson_id:
        return None
    if lesson_id in evals:
        return evals[lesson_id]
    short = lesson_id.split(":")[-1] if ":" in lesson_id else lesson_id
    for cid, ev in evals.items():
        if cid == lesson_id or cid.endswith(f":{short}") or lesson_id.endswith(f":{cid.split(':')[-1]}"):
            return ev
        if cid.startswith(f"{lesson_id}_") or lesson_id.startswith(f"{cid}_"):
            return ev
    return None


def _scheduled_date(week_start: date, day_of_week: Optional[str]) -> Optional[date]:
    if not day_of_week:
        return None
    day_rank = {day: idx for idx, day in enumerate(DAY_ORDER)}
    idx = day_rank.get(day_of_week)
    if idx is None:
        return None
    return week_start + timedelta(days=idx)


def _parse_iso_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _lesson_index_for_id(lessons: List[Dict[str, Any]], lesson_id: str) -> Optional[int]:
    norm = (lesson_id or "").strip()
    if not norm:
        return None
    short = norm.split(":")[-1] if ":" in norm else norm
    for i, les in enumerate(lessons):
        cid = str(les.get("chapter_id") or les.get("id") or "")
        if cid == norm:
            return i
        uid = str(les.get("unit_id") or "")
        if uid and uid == short:
            return i
    return None


def _progress_percent_for_lesson(
    student_id: str,
    lesson_id: str,
    session: Dict[str, Any],
    ev: Optional[LessonEvaluation],
) -> int:
    if ev and ev.lesson_completed:
        return 100
    if str(session.get("status") or "") == "completed":
        return 100

    from .language_lesson_sections import last_part_index
    from .lesson_catalog_service import list_book_lessons, parse_chapter_id
    from .session_engine import load_book_lesson_progress, load_progress, progress_matches_book

    book_id, _ = parse_chapter_id(lesson_id)
    lessons = list_book_lessons(book_id)
    lesson_idx = _lesson_index_for_id(lessons, lesson_id)
    if lesson_idx is None:
        return 0

    lesson = lessons[lesson_idx]
    lesson_num = int(lesson.get("lesson_number") or (lesson_idx + 1))
    book_prog = load_book_lesson_progress(student_id, book_id)
    completed_numbers = {int(x) for x in (book_prog.get("completed_lesson_numbers") or [])}
    if lesson_num in completed_numbers:
        return 100

    part_count = max(1, last_part_index(book_id) + 1)
    prog = load_progress(student_id)
    on_lesson = (
        progress_matches_book(prog.get("chapter_id"), book_id)
        and int(prog.get("unit_index", -1)) == lesson_idx
    )
    if on_lesson:
        unit_part = int(prog.get("unit_part", 0))
        max_unlocked = int(prog.get("max_unlocked_part", 0))
        done_parts = max(unit_part, max_unlocked, int(session.get("unit_part") or 0))
        if done_parts >= part_count:
            return 99
        return max(5, min(99, int(round((done_parts / part_count) * 100))))

    if session.get("continue_available"):
        unit_part = int(session.get("unit_part") or 0)
        return max(5, min(99, int(round(((unit_part + 1) / part_count) * 100))))

    return 0


def _admin_schedule_status(
    session: Dict[str, Any],
    ev: Optional[LessonEvaluation],
    scheduled_date: Optional[date],
    today: date,
) -> str:
    raw = str(session.get("status") or "locked")
    if (ev and ev.lesson_completed) or raw == "completed":
        return "completed"
    if raw == "locked":
        return "locked"
    if scheduled_date and scheduled_date < today:
        return "missed"
    if session.get("continue_available"):
        return "in_progress"
    return "not_started"


def _last_activity_at(
    student_id: str,
    lesson_id: str,
    ev: Optional[LessonEvaluation],
    schedule_item: Optional[StudentLessonScheduleItem],
) -> Optional[str]:
    from .lesson_catalog_service import list_book_lessons, parse_chapter_id
    from .session_engine import load_progress, progress_matches_book

    candidates: List[datetime] = []
    if ev:
        if ev.completion_date:
            candidates.append(ev.completion_date)
        if ev.created_at:
            candidates.append(ev.created_at)
    if schedule_item:
        if schedule_item.completed_at:
            candidates.append(schedule_item.completed_at)
        if schedule_item.updated_at:
            candidates.append(schedule_item.updated_at)

    book_id, _ = parse_chapter_id(lesson_id)
    lessons = list_book_lessons(book_id)
    lesson_idx = _lesson_index_for_id(lessons, lesson_id)
    prog = load_progress(student_id)
    if lesson_idx is not None and progress_matches_book(prog.get("chapter_id"), book_id):
        if int(prog.get("unit_index", -1)) == lesson_idx:
            parsed = _parse_iso_dt(prog.get("updated_at"))
            if parsed:
                candidates.append(parsed)

    if not candidates:
        return None
    latest = max(candidates, key=lambda dt: dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))
    return latest.isoformat()


def _attendance_label(status: str, lesson_completed: bool = False) -> str:
    if lesson_completed:
        return "completed"
    s = (status or "").lower()
    if s == "present":
        return "attended"
    if s in ("absent", "late"):
        return "missed"
    if s == "excused":
        return "attended"
    return "not_started"


def parent_info_from_user(user: User) -> Dict[str, Any]:
    has_any = any(
        [
            user.guardian_name,
            user.guardian_email,
            user.guardian_phone_number,
            user.guardian_gender,
        ]
    )
    if not has_any:
        return {"available": False, "message": "Parent information not available."}
    return {
        "available": True,
        "parent_name": user.guardian_name or None,
        "parent_email": user.guardian_email or None,
        "parent_phone": user.guardian_phone_number or None,
        "relationship": user.guardian_gender or None,
        "emergency_contact": None,
        "emergency_contact_note": "Emergency contact not available.",
    }


async def _eval_map(db: AsyncSession, user_id: uuid.UUID) -> Dict[str, LessonEvaluation]:
    rows = await db.execute(
        select(LessonEvaluation).where(LessonEvaluation.user_id == user_id)
    )
    return {r.content_id: r for r in rows.scalars().all()}


def _chapter_for_student_subject(
    student_id: str,
    subject_name: str,
    grade: int = 6,
) -> Optional[str]:
    """Resume chapter for schedule links — same catalog + progress as student dashboard."""
    from .book_registry import get_primary_book
    from .lesson_catalog_service import first_lesson_chapter_for_subject
    from .schedule_sync_service import registry_key_from_db_subject
    from .student_resume_service import resolve_subject_resume

    registry_key = registry_key_from_db_subject(subject_name)
    book = get_primary_book(registry_key, grade=grade)
    book_id = (book or {}).get("book_id")
    resume = resolve_subject_resume(
        student_id,
        registry_key,
        subject_name,
        book_id,
    )
    if resume.get("chapter_id"):
        return str(resume["chapter_id"])
    return first_lesson_chapter_for_subject(registry_key, grade)


def _best_lesson_for_module(module_key: str, module_title: str) -> Optional[str]:
    """Pick first lesson chapter_id from book catalog module (legacy helper)."""
    from .portal_curriculum import portal_modules_for_admin

    for mod in portal_modules_for_admin():
        if mod["module_key"] == module_key or mod["module_title"] == module_title:
            lessons = mod.get("lessons") or []
            if lessons:
                return lessons[0].get("chapter_id")
    return None


async def student_activity_stats(db: AsyncSession, user_id: uuid.UUID) -> Dict[str, int]:
    """Real per-student counts for admin list and detail views."""
    from .lesson_schedule_service import fetch_student_weekly_schedule
    from .student_portal_service import fetch_student_portal_subjects

    portal_subjects = await fetch_student_portal_subjects(user_id, db)
    subjects_assigned_count = len(portal_subjects)

    week = await fetch_student_weekly_schedule(user_id, db, auto_generate=True)
    scheduled_lessons_count = sum(len(day.get("sessions") or []) for day in week)

    completed_result = await db.execute(
        select(func.count(LessonEvaluation.evaluation_id)).where(
            LessonEvaluation.user_id == user_id,
            LessonEvaluation.lesson_completed == True,
        )
    )
    completed_lessons_count = int(completed_result.scalar() or 0)

    return {
        "subjects_assigned_count": subjects_assigned_count,
        "scheduled_lessons_count": scheduled_lessons_count,
        "completed_lessons_count": completed_lessons_count,
    }


async def student_activity_stats_batch(
    db: AsyncSession, user_ids: List[uuid.UUID]
) -> Dict[uuid.UUID, Dict[str, int]]:
    """Batch stats for the student list page."""
    if not user_ids:
        return {}

    out: Dict[uuid.UUID, Dict[str, int]] = {
        uid: {
            "subjects_assigned_count": 0,
            "scheduled_lessons_count": 0,
            "completed_lessons_count": 0,
        }
        for uid in user_ids
    }

    week_start = sunday_of_week()

    schedule_result = await db.execute(
        select(
            StudentLessonScheduleItem.user_id,
            func.count(StudentLessonScheduleItem.schedule_item_id).label("cnt"),
        )
        .where(
            StudentLessonScheduleItem.user_id.in_(user_ids),
            StudentLessonScheduleItem.week_start_date == week_start,
        )
        .group_by(StudentLessonScheduleItem.user_id)
    )
    scheduled_by_user = {row.user_id: int(row.cnt) for row in schedule_result.all()}

    subject_result = await db.execute(
        select(
            StudentLessonScheduleItem.user_id,
            func.count(func.distinct(StudentLessonScheduleItem.subject_id)).label("cnt"),
        )
        .where(
            StudentLessonScheduleItem.user_id.in_(user_ids),
            StudentLessonScheduleItem.week_start_date == week_start,
        )
        .group_by(StudentLessonScheduleItem.user_id)
    )
    subjects_by_user = {row.user_id: int(row.cnt) for row in subject_result.all()}

    completed_result = await db.execute(
        select(
            LessonEvaluation.user_id,
            func.count(LessonEvaluation.evaluation_id).label("cnt"),
        )
        .where(
            LessonEvaluation.user_id.in_(user_ids),
            LessonEvaluation.lesson_completed == True,
        )
        .group_by(LessonEvaluation.user_id)
    )
    completed_by_user = {row.user_id: int(row.cnt) for row in completed_result.all()}

    for uid in user_ids:
        out[uid] = {
            "subjects_assigned_count": subjects_by_user.get(uid, 0),
            "scheduled_lessons_count": scheduled_by_user.get(uid, 0),
            "completed_lessons_count": completed_by_user.get(uid, 0),
        }
    return out


async def build_student_schedule(db: AsyncSession, user_id: uuid.UUID) -> List[Dict[str, Any]]:
    """
    Weekly lesson schedule for admin — merges saved schedule, live session progress,
    evaluations, and book unlock state for the requested student only.
    """
    from .lesson_schedule_service import fetch_student_weekly_schedule

    student_id = str(user_id)
    evals = await _eval_map(db, user_id)
    week_start = sunday_of_week()
    today = date.today()

    item_result = await db.execute(
        select(StudentLessonScheduleItem).where(
            StudentLessonScheduleItem.user_id == user_id,
            StudentLessonScheduleItem.week_start_date == week_start,
        )
    )
    items_by_lesson = {str(row.lesson_id): row for row in item_result.scalars().all()}

    week_data = await fetch_student_weekly_schedule(user_id, db, auto_generate=True)

    rows: List[Dict[str, Any]] = []
    for day_block in week_data:
        day = day_block.get("day_of_week")
        scheduled_date = _scheduled_date(week_start, day)
        for session in day_block.get("sessions") or []:
            lesson_id = str(session.get("lesson_id") or "")
            ev = _eval_for_lesson(evals, lesson_id)
            schedule_item = items_by_lesson.get(lesson_id)
            status = _admin_schedule_status(session, ev, scheduled_date, today)
            progress_percent = _progress_percent_for_lesson(student_id, lesson_id, session, ev)
            last_activity = _last_activity_at(student_id, lesson_id, ev, schedule_item)
            completion_time = None
            if ev and ev.completion_date:
                completion_time = ev.completion_date.isoformat()
            elif schedule_item and schedule_item.completed_at:
                completion_time = schedule_item.completed_at.isoformat()

            rows.append(
                {
                    "session_date": scheduled_date.isoformat() if scheduled_date else None,
                    "day_of_week": day,
                    "subject": session.get("subject_name") or "",
                    "module": session.get("lesson_title") or lesson_id,
                    "scheduled_start": None,
                    "scheduled_end": None,
                    "location": None,
                    "status": status,
                    "completion_time": completion_time,
                    "quiz_score": ev.overall_score if ev else None,
                    "chapter_id": lesson_id or None,
                    "schedule_id": str(session.get("schedule_item_id")) if session.get("schedule_item_id") else None,
                    "progress_percent": progress_percent,
                    "last_activity_at": last_activity,
                }
            )

    day_rank = {day: idx for idx, day in enumerate(DAY_ORDER)}
    rows.sort(
        key=lambda x: (
            day_rank.get(x.get("day_of_week") or "", 99),
            x.get("module") or "",
        )
    )
    return rows


async def build_student_attendance_sessions(db: AsyncSession, user_id: uuid.UUID) -> List[Dict[str, Any]]:
    """Dated sessions from attendance records, enriched with lesson completion."""
    user = await db.get(User, user_id)
    grade = int(user.grade_level or 6) if user else 6
    student_id = str(user_id)
    evals = await _eval_map(db, user_id)

    att_rows = await db.execute(
        select(Attendance, Schedule, Subject)
        .join(Schedule, Schedule.schedule_id == Attendance.schedule_id)
        .join(Subject, Subject.subject_id == Attendance.subject_id)
        .where(Attendance.user_id == user_id)
        .order_by(Attendance.session_date.desc(), Schedule.start_time.asc())
    )

    sessions: List[Dict[str, Any]] = []
    seen_keys: set = set()

    for row in att_rows.all():
        att: Attendance = row.Attendance
        sch: Schedule = row.Schedule
        subj: Subject = row.Subject
        module = _module_for_slot(subj.subject_name, sch.day_of_week, sch.start_time, sch.session_type)
        chapter_id = _chapter_for_student_subject(student_id, subj.subject_name, grade)

        matched_eval = None
        for cid, ev in evals.items():
            if ev.lesson_completed and (
                cid.startswith(module.lower().replace(" ", "_"))
                or (subj.subject_name.lower() in cid.lower())
            ):
                matched_eval = ev
                break

        status = _attendance_label(att.attendance_status, bool(matched_eval and matched_eval.lesson_completed))
        completion_time = matched_eval.completion_date if matched_eval else att.check_out_time or att.check_in_time
        quiz_score = matched_eval.overall_score if matched_eval else None
        chapter = chapter_id or (matched_eval.content_id if matched_eval else None)
        progress_percent = 100 if status == "completed" else (0 if not matched_eval else None)
        if matched_eval and not matched_eval.lesson_completed and chapter:
            progress_percent = 50
        last_activity = None
        if completion_time:
            last_activity = completion_time.isoformat() if hasattr(completion_time, "isoformat") else str(completion_time)
        elif matched_eval and matched_eval.created_at:
            last_activity = matched_eval.created_at.isoformat()

        key = (str(att.session_date), str(sch.schedule_id))
        seen_keys.add(key)
        sessions.append(
            {
                "session_date": att.session_date.isoformat(),
                "day_of_week": sch.day_of_week,
                "subject": subj.subject_name,
                "module": module,
                "scheduled_start": _time_str(sch.start_time),
                "scheduled_end": _time_str(sch.end_time),
                "attendance_status": att.attendance_status,
                "status": status,
                "completion_time": completion_time.isoformat() if completion_time and hasattr(completion_time, "isoformat") else (str(completion_time) if completion_time else None),
                "quiz_score": quiz_score,
                "chapter_id": chapter,
                "schedule_id": str(sch.schedule_id),
                "attendance_id": str(att.attendance_id),
                "progress_percent": progress_percent,
                "last_activity_at": last_activity,
            }
        )

    # Completed lessons without attendance row
    for cid, ev in evals.items():
        meta = find_lesson_meta(cid)
        if not ev.lesson_completed:
            continue
        key = ("eval", cid)
        if key in seen_keys:
            continue
        sessions.append(
            {
                "session_date": ev.completion_date.date().isoformat() if ev.completion_date else None,
                "day_of_week": None,
                "subject": meta["subject_title"] if meta else "Lesson",
                "module": meta["module_title"] if meta else cid.split(":")[0],
                "scheduled_start": None,
                "scheduled_end": None,
                "attendance_status": None,
                "status": "completed",
                "completion_time": ev.completion_date.isoformat() if ev.completion_date else None,
                "quiz_score": ev.overall_score,
                "chapter_id": cid,
                "schedule_id": None,
                "attendance_id": None,
                "progress_percent": 100,
                "last_activity_at": ev.completion_date.isoformat() if ev.completion_date else (ev.created_at.isoformat() if ev.created_at else None),
            }
        )

    sessions.sort(key=lambda x: (x.get("session_date") or "", x.get("scheduled_start") or ""), reverse=True)
    return sessions
