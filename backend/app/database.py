from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.seed import seed_questions
import app.models 

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.execute(
            text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS starter_code TEXT NOT NULL DEFAULT ''")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS candidate_access_token_hash VARCHAR(128)")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_client_id VARCHAR(128)")
        )
        await conn.execute(
            text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_lease_expires_at TIMESTAMPTZ")
        )
        await conn.execute(
            text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS invite_email VARCHAR")
        )
        await conn.execute(
            text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60")
        )
        await conn.execute(
            text("ALTER TABLE ai_configuration ADD COLUMN IF NOT EXISTS force_brute_force BOOLEAN NOT NULL DEFAULT FALSE")
        )
    async with async_session() as session:
        await seed_questions(session)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
