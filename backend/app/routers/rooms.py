import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_session
from app.models import Organization, Question, Room, RoomQuestionLink, Session, utc_now
from app.schemas import RoomCreateRequest, RoomCreateResponse, RoomJoinRequest, RoomJoinResponse
from app.services.auth import require_admin
from app.services.candidate_access import create_candidate_token
from app.services.code_snapshots import ensure_question_code_rows
from app.services.questions import get_room_questions, serialize_question
from app.services.room_code import create_unique_room_code
from app.services.telemetry import record_telemetry

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _starter_code_for_questions(questions: list[Question]) -> str:
    snippets = [
        f"# {question.title}\n{question.starter_code.strip()}"
        for question in questions
        if question.starter_code.strip()
    ]
    return "\n\n".join(snippets)


@router.post("/create", response_model=RoomCreateResponse)
async def create_room(
    payload: RoomCreateRequest,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> RoomCreateResponse:
    org_result = await db.exec(select(Organization).where(Organization.name == payload.org_name))
    org = org_result.first()
    if org is None:
        org = Organization(name=payload.org_name)
        db.add(org)
        await db.flush()

    selected_questions: list[Question] = []
    if payload.question_ids:
        result = await db.exec(select(Question).where(Question.id.in_(payload.question_ids)))
        questions_by_id = {question.id: question for question in result.all()}
        missing = [question_id for question_id in payload.question_ids if question_id not in questions_by_id]
        if missing:
            raise HTTPException(status_code=400, detail="One or more selected questions do not exist")
        selected_questions = [questions_by_id[question_id] for question_id in payload.question_ids]

    if selected_questions:
        problem_statement = "\n\n".join(
            f"## {index}. {question.title}\n\n{question.prompt}"
            for index, question in enumerate(selected_questions, start=1)
        )
        sample_input_output = "\n\n".join(
            f"### {question.title}\n{question.sample_input_output}"
            for question in selected_questions
        )
    else:
        if not payload.problem_statement or not payload.sample_input_output:
            raise HTTPException(status_code=400, detail="Select at least one question")
        problem_statement = payload.problem_statement
        sample_input_output = payload.sample_input_output

    room_code = await create_unique_room_code(db)
    room = Room(
        org_id=org.id,
        room_code=room_code,
        title=payload.title,
        problem_statement=problem_statement,
        sample_input_output=sample_input_output,
        max_tokens=payload.max_tokens,
        invite_email=str(payload.invite_email).lower(),
        duration_minutes=payload.duration_minutes,
    )
    db.add(room)
    await db.flush()

    for index, question in enumerate(selected_questions):
        db.add(
            RoomQuestionLink(
                room_id=room.id,
                question_id=question.id,
                order_index=index,
            )
        )

    now = utc_now()
    session = Session(
        room_id=room.id,
        candidate_email=room.invite_email,
        candidate_name="Pending candidate",
        current_code=_starter_code_for_questions(selected_questions),
        status="inactive",
        started_at=now,
        updated_at=now,
        expires_at=None,
    )
    db.add(session)
    await db.flush()
    await ensure_question_code_rows(session.id, selected_questions, db)

    await db.commit()
    await db.refresh(room)

    return RoomCreateResponse(
        room_id=room.id,
        room_code=room.room_code,
        title=room.title,
        max_tokens=room.max_tokens,
        invite_email=room.invite_email,
        duration_minutes=room.duration_minutes,
        questions=[serialize_question(question) for question in selected_questions],
    )


@router.post("/join", response_model=RoomJoinResponse)
async def join_room(
    payload: RoomJoinRequest,
    db: AsyncSession = Depends(get_session),
) -> RoomJoinResponse:
    room_code = payload.room_code.strip().upper()
    result = await db.exec(select(Room).where(Room.room_code == room_code))
    room = result.first()
    if room is None:
        raise HTTPException(status_code=404, detail="Invalid room code")
    candidate_email = payload.candidate_email.lower()
    if room.invite_email and room.invite_email.lower() != candidate_email:
        raise HTTPException(status_code=403, detail="This invite is not assigned to that email")

    existing_session_result = await db.exec(select(Session).where(Session.room_id == room.id))
    existing_session = existing_session_result.first()
    if existing_session is not None and existing_session.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Interview session is ongoing. Please wait for the current session to complete.",
        )
    if existing_session is not None and existing_session.status != "inactive":
        raise HTTPException(status_code=404, detail="Invalid room code")
    if existing_session is None:
        raise HTTPException(status_code=404, detail="Invalid room code")

    questions = await get_room_questions(room.id, db)
    now = utc_now()

    session = existing_session
    session.candidate_email = candidate_email
    session.candidate_name = payload.candidate_name
    session.current_code = _starter_code_for_questions(questions)
    session.status = "active"
    session.started_at = now
    session.updated_at = now
    session.expires_at = now + timedelta(minutes=room.duration_minutes)
    session.ended_at = None
    session.tokens_used = 0
    session.token_limit_hit = False
    session.active_client_id = None
    session.client_lease_expires_at = None
    session_token, session.candidate_access_token_hash = create_candidate_token()
    db.add(session)
    await db.flush()
    await ensure_question_code_rows(session.id, questions, db)
    await record_telemetry(
        session.id,
        "session_started",
        db,
        {"room_code": room.room_code, "candidate_email": candidate_email},
    )
    await db.commit()
    await db.refresh(session)

    return RoomJoinResponse(
        session_id=session.id,
        session_token=session_token,
        room_title=room.title,
        problem_statement=room.problem_statement,
        sample_input_output=room.sample_input_output,
        questions=[serialize_question(question) for question in questions],
        max_tokens=room.max_tokens,
        tokens_used=session.tokens_used,
        token_limit_hit=session.token_limit_hit,
        status=session.status,
        expires_at=session.expires_at,
    )
