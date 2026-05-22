import uuid
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, EmailStr


# ─── Auth ───────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str
    role: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ─── Users ──────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    date_of_birth: Optional[date] = None
    grade_level: Optional[int] = None
    phone_number: Optional[str] = None
    parent_email: Optional[EmailStr] = None
    parent_phone_number: Optional[str] = None


class UserRead(BaseModel):
    user_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    role: str
    date_of_birth: Optional[date] = None
    grade_level: Optional[int] = None
    phone_number: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone_number: Optional[str] = None
    account_status: str
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    grade_level: Optional[int] = None
    phone_number: Optional[str] = None
    parent_email: Optional[EmailStr] = None
    parent_phone_number: Optional[str] = None


# ─── Subjects ───────────────────────────────────────────────────────────────

class SubjectRead(BaseModel):
    subject_id: uuid.UUID
    subject_name: str
    subject_code: str
    subject_type: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Schedules ──────────────────────────────────────────────────────────────

class ScheduleRead(BaseModel):
    schedule_id: uuid.UUID
    subject_id: uuid.UUID
    subject: SubjectRead
    day_of_week: str
    start_time: time
    end_time: time
    location: Optional[str] = None
    session_type: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Enrollments ────────────────────────────────────────────────────────────

class EnrollmentCreate(BaseModel):
    schedule_id: uuid.UUID


class EnrollmentRead(BaseModel):
    enrollment_id: uuid.UUID
    user_id: uuid.UUID
    schedule_id: uuid.UUID
    schedule: ScheduleRead
    enrollment_status: str
    enrollment_date: date
    drop_date: Optional[date] = None

    model_config = {"from_attributes": True}


# ─── Attendance ─────────────────────────────────────────────────────────────

class AttendanceCreate(BaseModel):
    user_id: uuid.UUID
    subject_id: uuid.UUID
    schedule_id: uuid.UUID
    session_date: date
    attendance_status: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    notes: Optional[str] = None


class AttendanceRead(BaseModel):
    attendance_id: uuid.UUID
    user_id: uuid.UUID
    subject_id: uuid.UUID
    schedule_id: uuid.UUID
    session_date: date
    attendance_status: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    notes: Optional[str] = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


# ─── Quiz Attempts ───────────────────────────────────────────────────────────

class QuizAttemptCreate(BaseModel):
    subject_id: uuid.UUID
    content_id: str
    question_number: Optional[int] = None
    submitted_answer: str
    is_correct: Optional[bool] = None
    points_earned: int = 0
    response_audio_path: Optional[str] = None
    phoneme_accuracy_score: Optional[float] = None
    pronunciation_feedback: Optional[str] = None


class QuizAttemptRead(BaseModel):
    attempt_id: uuid.UUID
    user_id: uuid.UUID
    subject_id: uuid.UUID
    content_id: str
    question_number: Optional[int] = None
    submitted_answer: str
    is_correct: Optional[bool] = None
    points_earned: int
    phoneme_accuracy_score: Optional[float] = None
    pronunciation_feedback: Optional[str] = None
    attempt_timestamp: datetime

    model_config = {"from_attributes": True}


# ─── Lesson Evaluations ──────────────────────────────────────────────────────

class LessonEvaluationCreate(BaseModel):
    subject_id: uuid.UUID
    content_id: str
    grammar_score: Optional[float] = None
    comprehension_score: Optional[float] = None
    pronunciation_score: Optional[float] = None
    overall_score: Optional[float] = None
    number_of_attempts: Optional[int] = None
    feedback: Optional[str] = None
    lesson_completed: bool = False
    completion_date: Optional[datetime] = None


class LessonEvaluationRead(BaseModel):
    evaluation_id: uuid.UUID
    user_id: uuid.UUID
    subject_id: uuid.UUID
    content_id: str
    grammar_score: Optional[float] = None
    comprehension_score: Optional[float] = None
    pronunciation_score: Optional[float] = None
    overall_score: Optional[float] = None
    number_of_attempts: Optional[int] = None
    feedback: Optional[str] = None
    lesson_completed: bool
    completion_date: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Lab Experiments ─────────────────────────────────────────────────────────

class LabExperimentRead(BaseModel):
    experiment_id: uuid.UUID
    subject_id: uuid.UUID
    subject: SubjectRead
    content_id: str
    experiment_name: str
    difficulty_level: Optional[str] = None
    lab_scene_id: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Experiment Sessions ─────────────────────────────────────────────────────

class ExperimentSessionCreate(BaseModel):
    experiment_id: uuid.UUID


class ExperimentSessionUpdate(BaseModel):
    session_status: Optional[str] = None
    observation_accuracy: Optional[float] = None
    procedure_completion: Optional[float] = None
    safety_compliance: Optional[bool] = None
    expected_result_achieved: Optional[bool] = None
    final_score: Optional[int] = None
    number_of_attempts: Optional[int] = None
    feedback: Optional[str] = None


class ExperimentSessionRead(BaseModel):
    session_id: uuid.UUID
    user_id: uuid.UUID
    experiment_id: uuid.UUID
    experiment: LabExperimentRead
    start_time: datetime
    end_time: Optional[datetime] = None
    session_status: str
    observation_accuracy: Optional[float] = None
    procedure_completion: Optional[float] = None
    safety_compliance: Optional[bool] = None
    expected_result_achieved: Optional[bool] = None
    final_score: Optional[int] = None
    number_of_attempts: Optional[int] = None
    feedback: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Parent Notifications ─────────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    user_id: uuid.UUID
    parent_email: EmailStr
    notification_type: str
    subject: str
    message: str
    related_content_id: Optional[str] = None


class NotificationRead(BaseModel):
    notification_id: uuid.UUID
    user_id: uuid.UUID
    parent_email: str
    notification_type: str
    subject: str
    message: str
    is_read: bool
    sent_at: datetime
    read_at: Optional[datetime] = None
    related_content_id: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Dashboard ───────────────────────────────────────────────────────────────

class MySubjectRead(BaseModel):
    subject_id: uuid.UUID
    subject_name: str
    subject_code: str
    subject_type: Optional[str] = None
    enrolled_sessions_count: int


class WeekDayRead(BaseModel):
    day_of_week: str
    sessions: list[ScheduleRead]


# ─── Admin ───────────────────────────────────────────────────────────────────

class StudentSummaryRead(BaseModel):
    user_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    grade_level: Optional[int] = None
    account_status: str
    enrollment_count: int
    created_at: datetime


class AttendanceStats(BaseModel):
    total: int
    present: int
    absent: int
    late: int
    excused: int
    attendance_rate: float


class EvaluationStats(BaseModel):
    completed_lessons: int
    avg_overall_score: Optional[float] = None
    avg_grammar_score: Optional[float] = None
    avg_comprehension_score: Optional[float] = None
    avg_pronunciation_score: Optional[float] = None


class LabStats(BaseModel):
    completed_sessions: int
    avg_final_score: Optional[float] = None


class StudentOverviewRead(BaseModel):
    student: UserRead
    attendance: AttendanceStats
    evaluations: EvaluationStats
    labs: LabStats


class AttendanceReportItem(BaseModel):
    attendance_id: uuid.UUID
    student_name: str
    student_email: str
    subject_name: str
    session_date: date
    attendance_status: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None


class EvaluationReportItem(BaseModel):
    evaluation_id: uuid.UUID
    student_name: str
    student_email: str
    subject_name: str
    content_id: str
    overall_score: Optional[float] = None
    lesson_completed: bool
    created_at: datetime


class LabReportItem(BaseModel):
    session_id: uuid.UUID
    student_name: str
    student_email: str
    experiment_name: str
    session_status: str
    final_score: Optional[int] = None
    observation_accuracy: Optional[float] = None
    procedure_completion: Optional[float] = None
    start_time: datetime
    end_time: Optional[datetime] = None


class AccountStatusUpdate(BaseModel):
    account_status: str
