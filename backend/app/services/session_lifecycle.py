import uuid
from datetime import datetime, timezone

from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import ChatMessage, Question, Room, Session
from app.services.reports import create_or_update_report
from app.services.telemetry import record_telemetry


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def session_is_expired(session: Session) -> bool:
    return (
        session.status == "active"
        and session.expires_at is not None
        and session.expires_at <= utc_now()
    )


async def end_session_with_report(
    session: Session,
    room: Room,
    questions: list[Question],
    messages: list[ChatMessage],
    db: AsyncSession,
    status: str = "completed",
    telemetry_type: str = "session_ended",
    telemetry_metadata: dict | None = None,
) -> None:
    ended_at = utc_now()
    session.status = status
    session.ended_at = ended_at
    session.updated_at = ended_at
    db.add(session)
    await record_telemetry(session.id, telemetry_type, db, telemetry_metadata)
    await db.commit()
    await db.refresh(session)
    await create_or_update_report(session, room, questions, messages, db)
