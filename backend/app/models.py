import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student")
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    grade_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    parent_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    parent_phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    account_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    enrollments: Mapped[list["StudentScheduleEnrollment"]] = relationship(back_populates="user")
    attendance_records: Mapped[list["Attendance"]] = relationship(back_populates="user")
    quiz_attempts: Mapped[list["EnglishQuizAttempt"]] = relationship(back_populates="user")
    lesson_evaluations: Mapped[list["LessonEvaluation"]] = relationship(back_populates="user")
    experiment_sessions: Mapped[list["ExperimentSession"]] = relationship(back_populates="user")
    notifications: Mapped[list["ParentNotification"]] = relationship(back_populates="user")


class Subject(Base):
    __tablename__ = "subjects"

    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    subject_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    subject_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    schedules: Mapped[list["Schedule"]] = relationship(back_populates="subject")
    lab_experiments: Mapped[list["LabExperiment"]] = relationship(back_populates="subject")


class Schedule(Base):
    __tablename__ = "schedules"

    schedule_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.subject_id"), nullable=False)
    day_of_week: Mapped[str] = mapped_column(String(10), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    session_type: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    subject: Mapped["Subject"] = relationship(back_populates="schedules")
    enrollments: Mapped[list["StudentScheduleEnrollment"]] = relationship(back_populates="schedule")
    attendance_records: Mapped[list["Attendance"]] = relationship(back_populates="schedule")


class StudentScheduleEnrollment(Base):
    __tablename__ = "student_schedule_enrollments"

    enrollment_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    schedule_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("schedules.schedule_id"), nullable=False)
    enrollment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active")
    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    drop_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    user: Mapped["User"] = relationship(back_populates="enrollments")
    schedule: Mapped["Schedule"] = relationship(back_populates="enrollments")


class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.subject_id"), nullable=False)
    schedule_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("schedules.schedule_id"), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    attendance_status: Mapped[str] = mapped_column(String(20), nullable=False)
    check_in_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    check_out_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="attendance_records")
    subject: Mapped["Subject"] = relationship()
    schedule: Mapped["Schedule"] = relationship(back_populates="attendance_records")


class EnglishQuizAttempt(Base):
    __tablename__ = "english_quiz_attempts"

    attempt_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.subject_id"), nullable=False)
    content_id: Mapped[str] = mapped_column(String(255), nullable=False)
    question_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    submitted_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    points_earned: Mapped[int] = mapped_column(Integer, default=0)
    response_audio_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phoneme_accuracy_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pronunciation_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempt_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="quiz_attempts")
    subject: Mapped["Subject"] = relationship()


class LessonEvaluation(Base):
    __tablename__ = "lesson_evaluations"

    evaluation_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.subject_id"), nullable=False)
    content_id: Mapped[str] = mapped_column(String(255), nullable=False)
    grammar_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    comprehension_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pronunciation_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    number_of_attempts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lesson_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="lesson_evaluations")
    subject: Mapped["Subject"] = relationship()


class LabExperiment(Base):
    __tablename__ = "lab_experiments"

    experiment_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("subjects.subject_id"), nullable=False)
    content_id: Mapped[str] = mapped_column(String(255), nullable=False)
    experiment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    difficulty_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    lab_scene_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    subject: Mapped["Subject"] = relationship(back_populates="lab_experiments")
    sessions: Mapped[list["ExperimentSession"]] = relationship(back_populates="experiment")


class ExperimentSession(Base):
    __tablename__ = "experiment_sessions"

    session_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    experiment_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("lab_experiments.experiment_id"), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    session_status: Mapped[str] = mapped_column(String(20), nullable=False, default="In Progress")
    observation_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    procedure_completion: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    safety_compliance: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    expected_result_achieved: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    final_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    number_of_attempts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="experiment_sessions")
    experiment: Mapped["LabExperiment"] = relationship(back_populates="sessions")


class ParentNotification(Base):
    __tablename__ = "parent_notifications"

    notification_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    parent_email: Mapped[str] = mapped_column(String(150), nullable=False)
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    related_content_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship(back_populates="notifications")
