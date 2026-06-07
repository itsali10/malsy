import asyncio
from app.database import engine
from app.models import Base


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("All tables created successfully")
    await engine.dispose()


asyncio.run(main())
