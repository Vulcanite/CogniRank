from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.models import AIConfiguration
from app.services.ai import DEFAULT_AI_URL, DEFAULT_REPORT_PROMPT, SYSTEM_PROMPT


async def get_ai_configuration(db: AsyncSession) -> AIConfiguration:
    result = await db.exec(select(AIConfiguration).where(AIConfiguration.id == "default"))
    config = result.first()
    if config is not None:
        return config

    config = AIConfiguration(
        id="default",
        api_url=DEFAULT_AI_URL,
        model=settings.openrouter_model,
        system_prompt=SYSTEM_PROMPT,
        report_prompt=DEFAULT_REPORT_PROMPT,
        force_brute_force=False,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


def touch_ai_configuration(config: AIConfiguration) -> None:
    config.updated_at = datetime.now(timezone.utc)
