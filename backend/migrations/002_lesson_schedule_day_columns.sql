-- Day-based lesson schedule columns (no fixed clock times)
ALTER TABLE student_lesson_schedule_items ADD COLUMN IF NOT EXISTS lesson_title VARCHAR(255);
ALTER TABLE student_lesson_schedule_items ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(10);
