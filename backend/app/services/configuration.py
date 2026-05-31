from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.models import LLMConfiguration
from app.services.ai import (
    DEFAULT_BRUTE_FORCE_PROMPT,
    DEFAULT_CHAT_CONTEXT_PROMPT,
    DEFAULT_LLM_PROVIDER_URL,
    DEFAULT_REPORT_PROMPT,
    SYSTEM_PROMPT,
)


async def get_llm_configuration(db: AsyncSession) -> LLMConfiguration:
    result = await db.exec(select(LLMConfiguration).where(LLMConfiguration.id == "default"))
    config = result.first()
    if config is not None:
        changed = False
        if not config.chat_context_prompt:
            config.chat_context_prompt = DEFAULT_CHAT_CONTEXT_PROMPT
            changed = True
        if not config.brute_force_prompt:
            config.brute_force_prompt = DEFAULT_BRUTE_FORCE_PROMPT
            changed = True
        if changed:
            db.add(config)
            await db.commit()
            await db.refresh(config)
        return config

    config = LLMConfiguration(
        id="default",
        api_url=settings.llm_provider_url or DEFAULT_LLM_PROVIDER_URL,
        model=settings.llm_provider_model,
        system_prompt=SYSTEM_PROMPT,
        chat_context_prompt=DEFAULT_CHAT_CONTEXT_PROMPT,
        brute_force_prompt=DEFAULT_BRUTE_FORCE_PROMPT,
        report_prompt=DEFAULT_REPORT_PROMPT,
        force_brute_force=False,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


def touch_llm_configuration(config: LLMConfiguration) -> None:
    config.updated_at = datetime.now(timezone.utc)
