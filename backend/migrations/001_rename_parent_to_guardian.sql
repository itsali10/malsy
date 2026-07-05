-- Migration 001: Align users + parent_notifications with guardian_* model fields.
-- Safe for existing data: copies parent_* values, preserves all user rows.

BEGIN;

-- ── users ────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_gender VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_phone_number VARCHAR(20);

UPDATE users
SET
    guardian_email        = parent_email,
    guardian_phone_number = parent_phone_number,
    guardian_name         = 'Guardian',
    guardian_gender       = 'Unknown'
WHERE parent_email IS NOT NULL OR parent_phone_number IS NOT NULL;

UPDATE users
SET
    guardian_name         = COALESCE(guardian_name, 'Guardian'),
    guardian_gender       = COALESCE(guardian_gender, 'Unknown'),
    guardian_email        = COALESCE(guardian_email, 'unknown@placeholder.local'),
    guardian_phone_number = COALESCE(guardian_phone_number, '');

UPDATE users SET date_of_birth = COALESCE(date_of_birth, '2000-01-01') WHERE date_of_birth IS NULL;
UPDATE users SET grade_level   = COALESCE(grade_level, 6)             WHERE grade_level IS NULL;
UPDATE users SET phone_number  = COALESCE(phone_number, '')           WHERE phone_number IS NULL;

ALTER TABLE users DROP COLUMN IF EXISTS parent_email;
ALTER TABLE users DROP COLUMN IF EXISTS parent_phone_number;

ALTER TABLE users ALTER COLUMN guardian_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN guardian_gender SET NOT NULL;
ALTER TABLE users ALTER COLUMN guardian_email SET NOT NULL;
ALTER TABLE users ALTER COLUMN guardian_phone_number SET NOT NULL;
ALTER TABLE users ALTER COLUMN date_of_birth SET NOT NULL;
ALTER TABLE users ALTER COLUMN grade_level SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone_number SET NOT NULL;

-- ── parent_notifications ─────────────────────────────────────────────────────

ALTER TABLE parent_notifications ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(150);

UPDATE parent_notifications
SET guardian_email = parent_email
WHERE parent_email IS NOT NULL;

UPDATE parent_notifications
SET guardian_email = 'unknown@placeholder.local'
WHERE guardian_email IS NULL;

ALTER TABLE parent_notifications DROP COLUMN IF EXISTS parent_email;
ALTER TABLE parent_notifications ALTER COLUMN guardian_email SET NOT NULL;

COMMIT;
