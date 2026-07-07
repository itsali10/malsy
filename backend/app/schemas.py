import uuid
from datetime import date, datetime, time
from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


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
    date_of_birth: date
    grade_level: int
    phone_number: str
    guardian_name: str
    guardian_gender: str
    guardian_email: EmailStr
    guardian_phone_number: str


class UserRead(BaseModel):
    user_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    role: str
    date_of_birth: Optional[date] = None
    grade_level: Optional[int] = None
    phone_number: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_gender: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_phone_number: Optional[str] = None
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
    guardian_name: Optional[str] = None
    guardian_gender: Optional[str] = None
    guardian_email: Optional[EmailStr] = None
    guardian_phone_number: Optional[str] = None


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
    guardian_email: EmailStr
    notification_type: str
    subject: str
    message: str
    related_content_id: Optional[str] = None


class NotificationRead(BaseModel):
    notification_id: uuid.UUID
    user_id: uuid.UUID
    guardian_email: str
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
    subject_key: str = ""
    subject_name: str
    subject_code: str
    subject_type: Optional[str] = None
    enrolled_sessions_count: int = 0  # deprecated: use available_lessons_count
    available_lessons_count: int = 0
    icon: Optional[str] = None
    grade: Optional[int] = None
    primary_book_id: Optional[str] = None
    route: Optional[str] = None
    scheduled_today: bool = False


class StudentPortalSubjectRead(BaseModel):
    subject_id: uuid.UUID
    subject_key: str
    subject_name: str
    subject_code: str
    subject_type: Optional[str] = None
    icon: str = "📖"
    grade: int = 6
    primary_book_id: Optional[str] = None
    route: str
    enrolled_sessions_count: int = 0  # deprecated: use available_lessons_count
    available_lessons_count: int = 0
    scheduled_today: bool = False
    search_terms: List[str] = Field(default_factory=list)


class ContinueLearningSectionRead(BaseModel):
    index: int
    key: str
    title: str
    completed: bool = False
    active: bool = False


class ContinueLearningSubjectRead(BaseModel):
    subject_id: str = ""
    subject_key: str
    subject_name: str
    book_id: Optional[str] = None
    unlocked: bool = True
    locked: bool = False
    chapter_id: Optional[str] = None
    lesson_title: Optional[str] = None
    lesson_number: Optional[int] = None
    unit_part: int = 0
    section_title: Optional[str] = None
    progress_percent: int = 0
    section_statuses: List[ContinueLearningSectionRead] = Field(default_factory=list)
    updated_at: Optional[str] = None
    continue_available: bool = False
    icon: Optional[str] = None
    available_lessons_count: int = 0


class ContinueLearningRead(BaseModel):
    student_id: str
    subjects: List[ContinueLearningSubjectRead] = Field(default_factory=list)
    primary: Optional[ContinueLearningSubjectRead] = None


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
    enrollment_count: int = 0  # deprecated: use scheduled_lessons_count
    subjects_assigned_count: int = 0
    scheduled_lessons_count: int = 0
    completed_lessons_count: int = 0
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


class PortalLessonRead(BaseModel):
    id: int
    name: str
    description: str
    chapter_id: str
    completed: bool = False
    overall_score: Optional[float] = None


class PortalModuleRead(BaseModel):
    subject_key: str
    subject_title: str
    module_key: str
    module_title: str
    icon: str = ""
    lessons: List["PortalLessonRead"] = []


class StudentQuizScoreRead(BaseModel):
    content_id: str
    subject_name: Optional[str] = None
    overall_score: Optional[float] = None
    grammar_score: Optional[float] = None
    comprehension_score: Optional[float] = None
    pronunciation_score: Optional[float] = None
    lesson_completed: bool = False
    number_of_attempts: Optional[int] = None
    created_at: Optional[datetime] = None


class StudentProgressItemRead(BaseModel):
    content_id: str
    lesson_completed: bool
    overall_score: Optional[float] = None
    completion_date: Optional[datetime] = None


class StudentParentRead(BaseModel):
    available: bool
    message: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    relationship: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_contact_note: Optional[str] = None


class StudentSessionRead(BaseModel):
    session_date: Optional[str] = None
    day_of_week: Optional[str] = None
    subject: str
    module: str
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    location: Optional[str] = None
    attendance_status: Optional[str] = None
    status: str
    completion_time: Optional[str] = None
    quiz_score: Optional[float] = None
    chapter_id: Optional[str] = None
    schedule_id: Optional[str] = None
    attendance_id: Optional[str] = None
    progress_percent: Optional[int] = None
    last_activity_at: Optional[str] = None


class StudentOverviewRead(BaseModel):
    student: UserRead
    attendance: AttendanceStats
    evaluations: EvaluationStats
    labs: LabStats
    enrollment_count: int = 0  # deprecated: use scheduled_lessons_count
    subjects_assigned_count: int = 0
    scheduled_lessons_count: int = 0
    completed_lessons_count: int = 0
    enrolled_modules: List[PortalModuleRead] = []
    quiz_scores: List[StudentQuizScoreRead] = []
    progress: List[StudentProgressItemRead] = []


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


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminMeRead(BaseModel):
    username: str
    role: str = "admin"
    display_name: str = "Admin"


class BookRecordRead(BaseModel):
    book_id: str
    title: str
    subject: str
    grade: int
    status: str
    visible_to_students: bool
    archived: bool
    pdf_filename: Optional[str] = None
    uploaded_at: Optional[str] = None
    processed_at: Optional[str] = None
    error_message: Optional[str] = None
    unit_count: Optional[int] = None
    lesson_count: Optional[int] = None
    chunk_count: Optional[int] = None
    plan_status: Optional[str] = None
    plan_generated_at: Optional[str] = None
    plan_approved_at: Optional[str] = None
    plan_error: Optional[str] = None
    schedule_in_student_portal: Optional[bool] = None
    schedule_sync_at: Optional[str] = None
    schedule_students_affected: Optional[int] = None
    schedule_entries_created: Optional[int] = None
    processing: Optional[Dict[str, bool]] = None
    structure_status: Optional[str] = None
    structure_warning: Optional[str] = None
    structure_detection_method: Optional[str] = None
    structure_extracted_at: Optional[str] = None
    structure_approved_at: Optional[str] = None


class BookStructureLessonUpdate(BaseModel):
    lesson_id: str
    title: Optional[str] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None


class BookStructureUnitUpdate(BaseModel):
    unit_id: str
    title: Optional[str] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    lessons: Optional[List[BookStructureLessonUpdate]] = None


class BookStructureUpdate(BaseModel):
    units: List[BookStructureUnitUpdate]


class BookStructureRead(BaseModel):
    book_id: str
    title: str
    subject: str
    grade: int
    structure_status: Optional[str] = None
    structure_warning: Optional[str] = None
    structure_detection_method: Optional[str] = None
    page_count: Optional[int] = None
    units: List[dict] = []


class BookPlanUnitUpdate(BaseModel):
    unit_id: str
    title: Optional[str] = None
    module_key: Optional[str] = None


class BookPlanUpdate(BaseModel):
    units: List[BookPlanUnitUpdate]


class BookPlanUnitRead(BaseModel):
    unit_id: str
    title: Optional[str] = None
    keywords: Optional[List[str]] = None
    minutes: Optional[int] = None
    module_key: Optional[str] = None
    real_unit_id: Optional[str] = None
    unit_plan: Optional[dict] = None


class BookPlanRead(BaseModel):
    book_id: str
    plan_status: Optional[str] = None
    plan_generated_at: Optional[str] = None
    plan_approved_at: Optional[str] = None
    plan_error: Optional[str] = None
    objectives: List[str] = []
    modules: List[dict] = []
    subject_key: Optional[str] = None
    plan_layout: Optional[str] = None
    units: List[BookPlanUnitRead] = []


class BookVisibilityUpdate(BaseModel):
    visible_to_students: bool


class BookArchiveUpdate(BaseModel):
    archived: bool


class AdminDashboardRead(BaseModel):
    total_students: int
    active_students: int
    total_books: int
    visible_books: int
    processed_books: int
    processing_books: int
    failed_books: int
    archived_books: int


class AdminAnalyticsRead(BaseModel):
    students_by_grade: dict
    books_by_status: dict
    books_by_subject: dict
    recent_uploads: list


class SubjectBookSummary(BaseModel):
    book_id: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    visible_to_students: bool = False
    archived: bool = False
    unit_count: Optional[int] = None
    lesson_count: Optional[int] = None
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None
    uploaded_at: Optional[str] = None
    plan_status: Optional[str] = None


class SubjectContentRead(BaseModel):
    subject_key: str
    subject_name: str
    icon: str
    grade: int = 6
    student_session_count: int = 0
    generated_lesson_count: int = 0
    uploaded_book_count: int = 0
    has_book: bool = False
    book: Optional[SubjectBookSummary] = None
    books: List[SubjectBookSummary] = []
    visible_to_students: bool = True
    archived: bool = False
    builtin: bool = False


class SubjectRecordRead(BaseModel):
    subject_key: str
    subject_name: str
    icon: str
    grade: int = 6
    visible_to_students: bool = False
    archived: bool = False
    builtin: bool = False
    created_at: Optional[str] = None
    book: Optional[SubjectBookSummary] = None


class SubjectCreate(BaseModel):
    subject_name: str
    grade: int = 6
    icon: str = "📚"
    visible_to_students: bool = False


class SubjectVisibilityUpdate(BaseModel):
    visible_to_students: bool


class AdminPreviewSessionRequest(BaseModel):
    lesson_title: str = ""
    lesson_desc: str = ""
    unit_part: int = 0


class AdminPreviewSwitchPartRequest(BaseModel):
    unit_part: int = 0


class AdminRegenerateLessonRequest(BaseModel):
    lesson_title: str = ""
    lesson_desc: str = ""
    unit_part: Optional[int] = None


class GenerateRandomScheduleResponse(BaseModel):
    students_total: int = 0
    created: int = 0
    skipped: int = 0
    appended: int = 0
    regenerated: int = 0
    errors: int = 0
    details: List[dict] = []


class StudentLessonScheduleItemRead(BaseModel):
    schedule_item_id: uuid.UUID
    user_id: uuid.UUID
    subject_id: uuid.UUID
    lesson_id: str
    lesson_title: Optional[str] = None
    day_of_week: Optional[str] = None
    order_index: int
    status: str
    unlocked_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LessonScheduleSessionRead(BaseModel):
    """Day-based lesson session (optional clock time from personal timetable)."""
    schedule_item_id: uuid.UUID
    lesson_id: str
    lesson_title: str
    subject_id: uuid.UUID
    subject_name: str
    subject_key: str
    order_index: int
    status: str
    day_of_week: str
    lock_reason: Optional[str] = None
    action_label: Optional[str] = None
    unit_part: int = 0
    continue_available: bool = False
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class WeekDayLessonScheduleRead(BaseModel):
    day_of_week: str
    sessions: List[LessonScheduleSessionRead]

