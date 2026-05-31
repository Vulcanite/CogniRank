import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import get_session
from app.models import ChatMessage, Room, Session
from app.schemas import (
    ChatMessageResponse,
    ChatRequest,
    EndSessionResponse,
    LiveCodeRequest,
    SessionHeartbeatResponse,
    SessionStateResponse,
    SyncCodeRequest,
    SyncCodeResponse,
    TelemetryRequest,
)
from app.services.ai import stream_chat_completion
from app.services.candidate_access import authorize_candidate_access
from app.services.code_snapshots import get_code_by_question, update_question_code
from app.services.configuration import get_llm_configuration
from app.services.live_code import live_code_hub
from app.services.questions import get_room_questions, serialize_question
from app.services.reports import serialize_report
from app.services.session_lifecycle import end_session_with_report, session_is_expired
from app.services.telemetry import record_telemetry

router = APIRouter(prefix="/api/session", tags=["sessions"])


CHAT_EVALUATION_GUARDRAILS = """Runtime interview guardrails:
- When explaining the active question, explain only the goal, inputs, outputs, examples, and constraints.
- Do not reveal or suggest the algorithmic approach, data structures, complexity target, pointer technique, recurrence, traversal order, or implementation plan before the candidate states them.
- Do not include sections titled "High-level approach", "Approach suggestion", or similar unless the candidate has already independently provided that approach with justification.
- If the candidate repeats wording that the assistant previously suggested, ask for their own justification before treating it as candidate reasoning.
- Ask probing questions instead of giving solution strategy."""


def _estimate_token_usage(messages: list[dict[str, str]], assistant_text: str) -> int:
    text = "\n".join(message.get("content", "") for message in messages)
    text = f"{text}\n{assistant_text}"
    return max(1, (len(text) + 3) // 4)


def _live_code_event(
    question_id: uuid.UUID | None,
    current_code: str,
    updated_at: datetime,
    status: str,
) -> dict[str, str | None]:
    return {
        "question_id": str(question_id) if question_id else None,
        "current_code": current_code,
        "updated_at": updated_at.isoformat(),
        "status": status,
    }


def _provider_message(message: ChatMessage) -> dict[str, str]:
    return {
        "role": message.role,
        "content": message.message,
    }


async def _get_session_or_404(session_id: uuid.UUID, db: AsyncSession) -> Session:
    result = await db.exec(select(Session).where(Session.id == session_id))
    session = result.first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


async def _get_room_for_session(session: Session, db: AsyncSession) -> Room:
    result = await db.exec(select(Room).where(Room.id == session.room_id))
    room = result.first()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


async def _get_messages(session_id: uuid.UUID, db: AsyncSession) -> list[ChatMessage]:
    messages_result = await db.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp)
    )
    return list(messages_result.all())


@router.get("/{session_id}", response_model=SessionStateResponse)
async def get_session_state(
    session_id: uuid.UUID,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> SessionStateResponse:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    room = await _get_room_for_session(session, db)
    questions = await get_room_questions(room.id, db)
    messages = await _get_messages(session_id, db)

    if session_is_expired(session):
        await end_session_with_report(
            session,
            room,
            questions,
            messages,
            db,
            status="expired",
            telemetry_type="session_expired",
            telemetry_metadata={"reason": "timer_elapsed"},
        )
        session = await _get_session_or_404(session_id, db)

    code_by_question = await get_code_by_question(session.id, questions, db)
    await db.commit()

    combined_code = "\n\n".join(code_by_question.values())

    return SessionStateResponse(
        session_id=session.id,
        room_title=room.title,
        problem_statement=room.problem_statement,
        sample_input_output=room.sample_input_output,
        questions=[serialize_question(question) for question in questions],
        current_code=combined_code,
        max_tokens=room.max_tokens,
        tokens_used=session.tokens_used,
        token_limit_hit=session.token_limit_hit,
        status=session.status,
        ended_at=session.ended_at,
        expires_at=session.expires_at,
        code_by_question=code_by_question,
        messages=[
            ChatMessageResponse(
                id=msg.id,
                question_id=msg.question_id,
                role=msg.role,
                message=msg.message,
                timestamp=msg.timestamp,
            )
            for msg in messages
        ],
    )


@router.post("/{session_id}/sync-code", response_model=SyncCodeResponse)
async def sync_code(
    session_id: uuid.UUID,
    payload: SyncCodeRequest,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> SyncCodeResponse:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    room = await _get_room_for_session(session, db)
    questions = await get_room_questions(room.id, db)
    if session_is_expired(session):
        await end_session_with_report(
            session,
            room,
            questions,
            await _get_messages(session_id, db),
            db,
            status="expired",
            telemetry_type="session_expired",
            telemetry_metadata={"reason": "timer_elapsed"},
        )
        raise HTTPException(status_code=409, detail="Session has expired")
    if session.status != "active":
        raise HTTPException(status_code=409, detail="Session is complete")

    if payload.question_id is not None:
        question_ids = {question.id for question in questions}
        if payload.question_id not in question_ids:
            raise HTTPException(status_code=400, detail="Question is not part of this session")
        await update_question_code(session.id, payload.question_id, payload.current_code, db)
    session.current_code = payload.current_code
    session.updated_at = datetime.now(timezone.utc)
    db.add(session)
    await record_telemetry(
        session.id,
        "code_synced",
        db,
        {
            "question_id": str(payload.question_id) if payload.question_id else None,
            "code_length": len(payload.current_code),
        },
    )
    await db.commit()
    await db.refresh(session)
    live_code_hub.publish(
        session.id,
        _live_code_event(payload.question_id, payload.current_code, session.updated_at, session.status),
    )
    return SyncCodeResponse(updated_at=session.updated_at)


@router.post("/{session_id}/live-code", response_model=SyncCodeResponse)
async def live_code(
    session_id: uuid.UUID,
    payload: LiveCodeRequest,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> SyncCodeResponse:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    room = await _get_room_for_session(session, db)
    questions = await get_room_questions(room.id, db)
    if session_is_expired(session):
        await end_session_with_report(
            session,
            room,
            questions,
            await _get_messages(session_id, db),
            db,
            status="expired",
            telemetry_type="session_expired",
            telemetry_metadata={"reason": "timer_elapsed"},
        )
        raise HTTPException(status_code=409, detail="Session has expired")
    if session.status != "active":
        raise HTTPException(status_code=409, detail="Session is complete")

    question_ids = {question.id for question in questions}
    if payload.question_id not in question_ids:
        raise HTTPException(status_code=400, detail="Question is not part of this session")

    await update_question_code(session.id, payload.question_id, payload.current_code, db)
    session.current_code = payload.current_code
    session.updated_at = datetime.now(timezone.utc)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    live_code_hub.publish(
        session.id,
        _live_code_event(payload.question_id, payload.current_code, session.updated_at, session.status),
    )
    return SyncCodeResponse(updated_at=session.updated_at)


@router.post("/{session_id}/chat")
async def chat(
    session_id: uuid.UUID,
    payload: ChatRequest,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
):
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    room = await _get_room_for_session(session, db)
    questions = await get_room_questions(room.id, db)
    llm_config = await get_llm_configuration(db)

    if session_is_expired(session):
        await end_session_with_report(
            session,
            room,
            questions,
            await _get_messages(session_id, db),
            db,
            status="expired",
            telemetry_type="session_expired",
            telemetry_metadata={"reason": "timer_elapsed"},
        )
        session = await _get_session_or_404(session_id, db)

    if session.status != "active":
        async def closed_event():
            detail = "Session has expired" if session.status == "expired" else "Session is complete"
            yield {"event": "error", "data": json.dumps({"detail": detail})}

        return EventSourceResponse(closed_event())

    # Token limit check disabled for now
    # if session.token_limit_hit or session.tokens_used >= room.max_tokens:
    #     session.token_limit_hit = True
    #     db.add(session)
    #     await db.commit()
    #
    #     async def limit_event():
    #         yield {"event": "error", "data": json.dumps({"detail": "Token limit reached"})}
    #
    #     return EventSourceResponse(limit_event())

    llm_api_key = llm_config.api_key_secret or settings.llm_provider_key
    if not llm_api_key:
        raise HTTPException(status_code=500, detail="LLM API key not configured")

    if payload.question_id is not None and payload.question_id not in {question.id for question in questions}:
        raise HTTPException(status_code=400, detail="Question is not part of this session")

    user_message = ChatMessage(
        session_id=session.id,
        question_id=payload.question_id,
        role="user",
        message=payload.message,
    )
    db.add(user_message)
    await record_telemetry(
        session.id,
        "chat_user_message",
        db,
        {"message_length": len(payload.message)},
    )
    await db.commit()
    await db.refresh(user_message)

    history_result = await db.exec(
        select(ChatMessage)
        .where(
            ChatMessage.session_id == session_id,
            ChatMessage.question_id == payload.question_id,
        )
        .order_by(ChatMessage.timestamp)
    )
    history = history_result.all()

    active_question = next((question for question in questions if question.id == payload.question_id), None)
    if active_question is None and questions:
        active_question = questions[0]

    code_by_question = await get_code_by_question(session.id, questions, db)
    active_code = (
        code_by_question.get(active_question.id, active_question.starter_code)
        if active_question
        else session.current_code
    )
    question_context = (
        f"{active_question.title}\n{active_question.prompt}\nSample:\n{active_question.sample_input_output}"
        if active_question
        else room.problem_statement
    )
    context_prompt = (
        f"{llm_config.chat_context_prompt}\n\n"
        f"Room title: {room.title}\n\n"
        f"Active question:\n{question_context or room.problem_statement}\n\n"
        f"Candidate's latest synced code for the active question:\n{active_code or '[empty editor]'}"
    )

    system_prompt = f"{llm_config.system_prompt}\n\n{CHAT_EVALUATION_GUARDRAILS}"
    if getattr(llm_config, "force_brute_force", False):
        system_prompt += f"\n\n{llm_config.brute_force_prompt}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": context_prompt},
    ]
    for msg in history:
        messages.append(_provider_message(msg))

    async def event_generator():
        from app.database import async_session

        assistant_text = ""
        tokens_used = 0

        try:
            async for chunk_data in stream_chat_completion(
                llm_api_key,
                llm_config.api_url,
                llm_config.model,
                messages,
            ):
                try:
                    chunk = json.loads(chunk_data)
                except json.JSONDecodeError:
                    continue

                if chunk.get("usage"):
                    tokens_used = chunk["usage"].get("total_tokens", 0)

                choices = chunk.get("choices", [])
                if not choices:
                    continue

                delta = choices[0].get("delta", {})
                content = delta.get("content")
                if content:
                    assistant_text += content
                    yield {"event": "token", "data": json.dumps({"content": content})}

            if not assistant_text:
                assistant_text = "I'm here to help you think through your approach. What's your high-level strategy?"

            token_source = "provider"
            if tokens_used <= 0:
                tokens_used = _estimate_token_usage(messages, assistant_text)
                token_source = "estimated"

            async with async_session() as save_db:
                assistant_message = ChatMessage(
                    session_id=session.id,
                    question_id=payload.question_id,
                    role="assistant",
                    message=assistant_text,
                )
                save_db.add(assistant_message)
                await record_telemetry(
                    session.id,
                    "chat_assistant_message",
                    save_db,
                    {
                        "message_length": len(assistant_text),
                        "tokens_used": tokens_used,
                        "token_source": token_source,
                    },
                )

                save_result = await save_db.exec(select(Session).where(Session.id == session_id))
                save_session = save_result.one()
                room_result = await save_db.exec(select(Room).where(Room.id == save_session.room_id))
                save_room = room_result.one()

                save_session.tokens_used += tokens_used
                # Token limit check disabled for now
                # if save_session.tokens_used >= save_room.max_tokens:
                #     save_session.token_limit_hit = True
                save_session.updated_at = datetime.now(timezone.utc)
                save_db.add(save_session)
                await save_db.commit()
                await save_db.refresh(save_session)

                yield {
                    "event": "done",
                    "data": json.dumps(
                        {
                            "tokens_used": save_session.tokens_used,
                            "max_tokens": save_room.max_tokens,
                            "token_limit_hit": save_session.token_limit_hit,
                        }
                    ),
                }
        except Exception as exc:
            async with async_session() as error_db:
                await record_telemetry(
                    session.id,
                    "ai_provider_error",
                    error_db,
                    {"error_type": exc.__class__.__name__},
                )
                await error_db.commit()
            yield {
                "event": "error",
                "data": json.dumps({"detail": "LLM response failed. Please try again."}),
            }

    return EventSourceResponse(event_generator())


@router.post("/{session_id}/telemetry")
async def telemetry(
    session_id: uuid.UUID,
    payload: TelemetryRequest,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    if session.status != "active":
        return {"recorded": False}
    await record_telemetry(session.id, payload.event_type, db, payload.metadata)
    await db.commit()
    return {"recorded": True}


@router.post("/{session_id}/heartbeat", response_model=SessionHeartbeatResponse)
async def heartbeat(
    session_id: uuid.UUID,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> SessionHeartbeatResponse:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    await db.commit()
    await db.refresh(session)
    return SessionHeartbeatResponse(
        status=session.status,
        lease_expires_at=session.client_lease_expires_at,
    )


@router.post("/{session_id}/end", response_model=EndSessionResponse)
async def end_session(
    session_id: uuid.UUID,
    session_token: str | None = Header(default=None, alias="X-Session-Token"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    db: AsyncSession = Depends(get_session),
) -> EndSessionResponse:
    session = await _get_session_or_404(session_id, db)
    await authorize_candidate_access(session, db, session_token, client_id)
    room = await _get_room_for_session(session, db)
    questions = await get_room_questions(room.id, db)
    messages = await _get_messages(session_id, db)
    await end_session_with_report(
        session,
        room,
        questions,
        messages,
        db,
        status="completed",
        telemetry_type="session_ended",
        telemetry_metadata={"reason": "candidate_clicked_end"},
    )
    session = await _get_session_or_404(session_id, db)
    from app.services.reports import get_report_for_session

    report = await get_report_for_session(session.id, db)
    if report is None:
        raise HTTPException(status_code=500, detail="Report generation failed")
    return EndSessionResponse(
        status=session.status,
        ended_at=session.ended_at or datetime.now(timezone.utc),
        report=serialize_report(report),
    )
