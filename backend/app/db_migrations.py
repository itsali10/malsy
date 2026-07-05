"""Lightweight schema patches for columns added after initial table creation."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def apply_schema_patches(conn: AsyncConnection) -> None:
    await conn.execute(
        text(
            "ALTER TABLE student_lesson_schedule_items "
            "ADD COLUMN IF NOT EXISTS lesson_title VARCHAR(255)"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE student_lesson_schedule_items "
            "ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(10)"
        )
    )
    await conn.execute(
        text(
            "ALTER TABLE student_lesson_schedule_items "
            "ADD COLUMN IF NOT EXISTS week_start_date DATE"
        )
    )
