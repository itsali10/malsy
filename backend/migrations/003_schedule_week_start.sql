-- Per-student weekly schedule ownership (calendar week start = Sunday)
ALTER TABLE student_lesson_schedule_items ADD COLUMN IF NOT EXISTS week_start_date DATE;
