"""Apply SQL migrations from backend/migrations/. Idempotent where possible."""
import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

from app.database import engine

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _sql_statements(sql: str) -> list[str]:
    lines = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    return [
        stmt.strip()
        for stmt in cleaned.split(";")
        if stmt.strip() and stmt.strip().upper() not in ("BEGIN", "COMMIT", "ROLLBACK")
    ]


async def main() -> None:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("No migration files found.")
        return

    for path in files:
        sql = path.read_text(encoding="utf-8")
        print(f"Applying {path.name} ...")
        statements = _sql_statements(sql)
        async with engine.begin() as conn:
            for stmt in statements:
                await conn.execute(text(stmt))
        print(f"  OK: {path.name}")

    await engine.dispose()
    print("All migrations applied successfully.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        sys.exit(1)
