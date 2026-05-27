import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.database import get_session
from app.models import ChatMessage, Room, Session
from app.schemas import (
    AIConfigurationResponse,
    AIConfigurationUpdateRequest,
    AdminSessionDetailResponse,
    AdminSessionSummaryResponse,
    ChatMessageResponse,
)
from app.services.auth import require_admin
from app.services.code_snapshots import get_code_by_question, get_code_snapshots
from app.services.configuration import get_ai_configuration, touch_ai_configuration
from app.services.live_code import live_code_hub
from app.services.questions import get_room_questions, serialize_question
from app.services.reports import create_or_update_report, get_report_for_session, serialize_report
from app.services.session_lifecycle import end_session_with_report
from app.services.telemetry import get_telemetry_events

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _serialize_ai_config(config) -> AIConfigurationResponse:
    return AIConfigurationResponse(
        api_url=config.api_url,
        model=config.model,
        system_prompt=config.system_prompt,
        report_prompt=config.report_prompt,
        force_brute_force=config.force_brute_force,
        reasoning_enabled=config.reasoning_enabled,
        reasoning_config_json=config.reasoning_config_json,
        updated_at=config.updated_at,
    )


@router.get("/config", response_model=AIConfigurationResponse)
async def get_config(
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> AIConfigurationResponse:
    config = await get_ai_configuration(db)
    return _serialize_ai_config(config)


@router.put("/config", response_model=AIConfigurationResponse)
async def update_config(
    payload: AIConfigurationUpdateRequest,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> AIConfigurationResponse:
    config = await get_ai_configuration(db)
    config.api_url = payload.api_url
    config.model = payload.model
    config.system_prompt = payload.system_prompt
    config.report_prompt = payload.report_prompt
    config.force_brute_force = payload.force_brute_force
    config.reasoning_enabled = payload.reasoning_enabled
    config.reasoning_config_json = payload.reasoning_config_json
    touch_ai_configuration(config)
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return _serialize_ai_config(config)


async def _serialize_session_summary(
    session: Session,
    room: Room,
    db: AsyncSession,
) -> AdminSessionSummaryResponse:
    questions = await get_room_questions(room.id, db)
    report = await get_report_for_session(session.id, db)

    from app.models import TelemetryEvent
    from app.services.telemetry import calculate_suspicious_flags

    telemetry_result = await db.exec(
        select(TelemetryEvent).where(TelemetryEvent.session_id == session.id)
    )
    events = telemetry_result.all()
    flags = calculate_suspicious_flags(events)

    return AdminSessionSummaryResponse(
        session_id=session.id,
        room_id=room.id,
        room_title=room.title,
        room_code=room.room_code,
        candidate_name=session.candidate_name,
        candidate_email=session.candidate_email,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        expires_at=session.expires_at,
        updated_at=session.updated_at,
        tokens_used=session.tokens_used,
        max_tokens=room.max_tokens,
        duration_minutes=room.duration_minutes,
        invite_email=room.invite_email,
        question_count=len(questions),
        report_ready=report is not None,
        suspicious_flags=flags,
    )


@router.get("/sessions", response_model=list[AdminSessionSummaryResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> list[AdminSessionSummaryResponse]:
    from sqlalchemy import func
    from app.models import TelemetryEvent, InterviewReport, RoomQuestionLink
    from app.services.telemetry import calculate_suspicious_flags

    result = await db.exec(select(Session).order_by(Session.updated_at.desc()))
    sessions = list(result.all())
    if not sessions:
        return []

    room_ids = list({s.room_id for s in sessions})
    rooms_result = await db.exec(select(Room).where(Room.id.in_(room_ids)))
    rooms_map = {r.id: r for r in rooms_result.all()}

    session_ids = [s.id for s in sessions]
    reports_result = await db.exec(
        select(InterviewReport).where(InterviewReport.session_id.in_(session_ids))
    )
    reports_map = {rep.session_id: rep for rep in reports_result.all()}

    q_result = await db.exec(
        select(RoomQuestionLink.room_id, func.count(RoomQuestionLink.question_id))
        .where(RoomQuestionLink.room_id.in_(room_ids))
        .group_by(RoomQuestionLink.room_id)
    )
    question_counts = {row[0]: row[1] for row in q_result.all()}

    suspicious_event_types = {
        "tab_visibility_changed",
        "copy_attempt_blocked",
        "cut_attempt_blocked",
        "paste_attempt_blocked",
        "copy_shortcut_blocked",
        "cut_shortcut_blocked",
        "paste_shortcut_blocked",
    }
    telemetry_result = await db.exec(
        select(TelemetryEvent)
        .where(TelemetryEvent.session_id.in_(session_ids))
        .where(TelemetryEvent.event_type.in_(suspicious_event_types))
    )

    from collections import defaultdict
    events_by_session = defaultdict(list)
    for event in telemetry_result.all():
        events_by_session[event.session_id].append(event)

    summaries: list[AdminSessionSummaryResponse] = []
    for session in sessions:
        room = rooms_map.get(session.room_id)
        if room is None:
            continue
        report = reports_map.get(session.id)
        q_count = question_counts.get(room.id, 0)
        session_events = events_by_session.get(session.id, [])
        flags = calculate_suspicious_flags(session_events)

        summaries.append(
            AdminSessionSummaryResponse(
                session_id=session.id,
                room_id=room.id,
                room_title=room.title,
                room_code=room.room_code,
                candidate_name=session.candidate_name,
                candidate_email=session.candidate_email,
                status=session.status,
                started_at=session.started_at,
                ended_at=session.ended_at,
                expires_at=session.expires_at,
                updated_at=session.updated_at,
                tokens_used=session.tokens_used,
                max_tokens=room.max_tokens,
                duration_minutes=room.duration_minutes,
                invite_email=room.invite_email,
                question_count=q_count,
                report_ready=report is not None,
                suspicious_flags=flags,
            )
        )
    return summaries


@router.get("/sessions/{session_id}", response_model=AdminSessionDetailResponse)
async def get_session_detail(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> AdminSessionDetailResponse:
    result = await db.exec(select(Session).where(Session.id == session_id))
    session = result.first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    room_result = await db.exec(select(Room).where(Room.id == session.room_id))
    room = room_result.first()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    messages_result = await db.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.timestamp)
    )
    questions = await get_room_questions(room.id, db)
    code_snapshots = await get_code_snapshots(session.id, questions, db)
    telemetry = await get_telemetry_events(session.id, db)
    report = await get_report_for_session(session.id, db)
    summary = await _serialize_session_summary(session, room, db)
    return AdminSessionDetailResponse(
        **summary.model_dump(),
        current_code=session.current_code,
        questions=[serialize_question(question) for question in questions],
        code_snapshots=code_snapshots,
        messages=[
            ChatMessageResponse(
                id=message.id,
                question_id=message.question_id,
                role=message.role,
                message=message.message,
                timestamp=message.timestamp,
            )
            for message in messages_result.all()
        ],
        telemetry=telemetry,
        report=serialize_report(report) if report is not None else None,
    )


@router.get("/sessions/{session_id}/live-code")
async def stream_session_code(
    session_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> EventSourceResponse:
    result = await db.exec(select(Session).where(Session.id == session_id))
    session = result.first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    room_result = await db.exec(select(Room).where(Room.id == session.room_id))
    room = room_result.first()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    questions = await get_room_questions(room.id, db)
    code_by_question = await get_code_by_question(session.id, questions, db)
    await db.commit()
    initial_event = {
        "code_by_question": {str(question_id): code for question_id, code in code_by_question.items()},
        "status": session.status,
        "updated_at": session.updated_at.isoformat(),
    }

    async def event_generator():
        yield {"event": "code_snapshot", "data": json.dumps(initial_event)}
        queue = live_code_hub.subscribe(session.id)
        try:
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20)
                    yield {"event": "code_update", "data": json.dumps(event)}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            live_code_hub.unsubscribe(session.id, queue)

    return EventSourceResponse(event_generator())


@router.post("/sessions/{session_id}/close", response_model=AdminSessionDetailResponse)
async def close_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> AdminSessionDetailResponse:
    result = await db.exec(select(Session).where(Session.id == session_id))
    session = result.first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    room_result = await db.exec(select(Room).where(Room.id == session.room_id))
    room = room_result.first()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    questions = await get_room_questions(room.id, db)
    messages_result = await db.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.timestamp)
    )
    if session.status == "inactive":
        raise HTTPException(status_code=409, detail="Session has not started yet")
    if session.status == "active":
        await end_session_with_report(
            session,
            room,
            questions,
            messages_result.all(),
            db,
            status="completed",
            telemetry_type="session_ended_by_admin",
            telemetry_metadata={"reason": "admin_clicked_end"},
        )
    else:
        await create_or_update_report(session, room, questions, messages_result.all(), db)

    return await get_session_detail(session_id, db, _)
