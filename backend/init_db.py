import asyncio
from app.database import engine
from app.models import Base
from app.db_migrations import apply_schema_patches


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await apply_schema_patches(conn)
    print("All tables created successfully")
    await engine.dispose()


asyncio.run(main())
