import json
import uuid

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import TelemetryEvent
from app.schemas import TelemetryEventResponse


async def record_telemetry(
    session_id: uuid.UUID,
    event_type: str,
    db: AsyncSession,
    metadata: dict | None = None,
) -> None:
    db.add(
        TelemetryEvent(
            session_id=session_id,
            event_type=event_type,
            metadata_json=json.dumps(metadata or {}),
        )
    )


async def get_telemetry_events(
    session_id: uuid.UUID,
    db: AsyncSession,
) -> list[TelemetryEventResponse]:
    result = await db.exec(
        select(TelemetryEvent)
        .where(TelemetryEvent.session_id == session_id)
        .order_by(TelemetryEvent.timestamp)
    )
    events: list[TelemetryEventResponse] = []
    for event in result.all():
        try:
            metadata = json.loads(event.metadata_json)
        except json.JSONDecodeError:
            metadata = {}
        events.append(
            TelemetryEventResponse(
                id=event.id,
                event_type=event.event_type,
                metadata=metadata,
                timestamp=event.timestamp,
            )
        )
    return events


def calculate_suspicious_flags(events: list) -> list[str]:
    flags = []
    hidden_tabs = 0
    blocked_clipboard = 0

    for event in events:
        event_type = getattr(event, "event_type", None)
        metadata = {}
        metadata_json = getattr(event, "metadata_json", None)
        if metadata_json:
            if isinstance(metadata_json, dict):
                metadata = metadata_json
            else:
                try:
                    metadata = json.loads(metadata_json)
                except (json.JSONDecodeError, TypeError):
                    metadata = {}
        else:
            metadata = getattr(event, "metadata", {}) or {}

        if event_type == "tab_visibility_changed" and metadata.get("visibility_state") == "hidden":
            hidden_tabs += 1
        elif event_type in (
            "copy_attempt_blocked",
            "cut_attempt_blocked",
            "paste_attempt_blocked",
            "copy_shortcut_blocked",
            "cut_shortcut_blocked",
            "paste_shortcut_blocked",
        ):
            blocked_clipboard += 1

    if hidden_tabs > 0:
        label = "time" if hidden_tabs == 1 else "times"
        flags.append(f"Tab exited {hidden_tabs} {label}")
    if blocked_clipboard > 0:
        label = "time" if blocked_clipboard == 1 else "times"
        flags.append(f"Clipboard block triggered {blocked_clipboard} {label}")

    return flags
