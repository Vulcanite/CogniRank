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
        if conn.dialect.name == "postgresql":
            await conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF to_regclass('public.llm_configuration') IS NULL THEN
                            IF to_regclass('public.ai_configuration') IS NOT NULL THEN
                                ALTER TABLE public.ai_configuration RENAME TO llm_configuration;
                            ELSIF to_regclass('public.ai_configurations') IS NOT NULL THEN
                                ALTER TABLE public.ai_configurations RENAME TO llm_configuration;
                            ELSIF to_regclass('public.llm_configurations') IS NOT NULL THEN
                                ALTER TABLE public.llm_configurations RENAME TO llm_configuration;
                            END IF;
                        END IF;
                    END $$;
                    """
                )
            )
        elif conn.dialect.name == "sqlite":
            existing_tables = {
                row[0]
                for row in (
                    await conn.execute(
                        text("SELECT name FROM sqlite_master WHERE type = 'table'")
                    )
                )
            }
            if "llm_configuration" not in existing_tables:
                for old_name in ("ai_configuration", "ai_configurations", "llm_configurations"):
                    if old_name in existing_tables:
                        await conn.execute(text(f"ALTER TABLE {old_name} RENAME TO llm_configuration"))
                        break

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
            text("ALTER TABLE llm_configuration ADD COLUMN IF NOT EXISTS force_brute_force BOOLEAN NOT NULL DEFAULT FALSE")
        )
        await conn.execute(
            text("ALTER TABLE llm_configuration ADD COLUMN IF NOT EXISTS api_key_secret TEXT")
        )
        await conn.execute(
            text("ALTER TABLE llm_configuration ADD COLUMN IF NOT EXISTS chat_context_prompt TEXT NOT NULL DEFAULT ''")
        )
        await conn.execute(
            text("ALTER TABLE llm_configuration ADD COLUMN IF NOT EXISTS brute_force_prompt TEXT NOT NULL DEFAULT ''")
        )
        if conn.dialect.name == "postgresql":
            await conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF to_regclass('public.ai_configuration') IS NOT NULL THEN
                            INSERT INTO public.llm_configuration (
                                id,
                                api_url,
                                api_key_secret,
                                model,
                                system_prompt,
                                chat_context_prompt,
                                brute_force_prompt,
                                report_prompt,
                                force_brute_force,
                                updated_at
                            )
                            SELECT
                                id,
                                api_url,
                                NULL,
                                model,
                                system_prompt,
                                '',
                                '',
                                report_prompt,
                                FALSE,
                                updated_at
                            FROM public.ai_configuration
                            ON CONFLICT (id) DO NOTHING;
                        ELSIF to_regclass('public.ai_configurations') IS NOT NULL THEN
                            INSERT INTO public.llm_configuration (
                                id,
                                api_url,
                                api_key_secret,
                                model,
                                system_prompt,
                                chat_context_prompt,
                                brute_force_prompt,
                                report_prompt,
                                force_brute_force,
                                updated_at
                            )
                            SELECT
                                id,
                                api_url,
                                NULL,
                                model,
                                system_prompt,
                                '',
                                '',
                                report_prompt,
                                FALSE,
                                updated_at
                            FROM public.ai_configurations
                            ON CONFLICT (id) DO NOTHING;
                        END IF;
                    END $$;
                    """
                )
            )
        await conn.execute(
            text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS question_id UUID")
        )
    async with async_session() as session:
        await seed_questions(session)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
