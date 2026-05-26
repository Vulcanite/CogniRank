import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_session
from app.models import Question, RoomQuestionLink
from app.schemas import QuestionCreateRequest, QuestionResponse, QuestionUpdateRequest
from app.services.auth import require_admin
from app.services.questions import serialize_question

router = APIRouter(prefix="/api/questions", tags=["questions"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "question"


async def _unique_slug(title: str, db: AsyncSession, exclude_id: uuid.UUID | None = None) -> str:
    base = _slugify(title)
    slug = base
    suffix = 2
    while True:
        result = await db.exec(select(Question).where(Question.slug == slug))
        existing = result.first()
        if existing is None or existing.id == exclude_id:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


@router.get("", response_model=list[QuestionResponse])
async def list_questions(
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> list[QuestionResponse]:
    result = await db.exec(select(Question))
    difficulty_rank = {"Easy": 0, "Medium": 1, "Hard": 2}
    questions = sorted(
        result.all(),
        key=lambda question: (difficulty_rank.get(question.difficulty, 99), question.title),
    )
    return [serialize_question(question) for question in questions]


@router.post("", response_model=QuestionResponse)
async def create_question(
    payload: QuestionCreateRequest,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> QuestionResponse:
    question = Question(
        slug=await _unique_slug(payload.title, db),
        title=payload.title,
        difficulty=payload.difficulty,
        prompt=payload.prompt,
        sample_input_output=payload.sample_input_output,
        starter_code=payload.starter_code,
        tags=",".join(tag.strip() for tag in payload.tags if tag.strip()),
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return serialize_question(question)


@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: uuid.UUID,
    payload: QuestionUpdateRequest,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> QuestionResponse:
    result = await db.exec(select(Question).where(Question.id == question_id))
    question = result.first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    if payload.title is not None:
        question.title = payload.title
        question.slug = await _unique_slug(payload.title, db, exclude_id=question.id)
    if payload.difficulty is not None:
        question.difficulty = payload.difficulty
    if payload.prompt is not None:
        question.prompt = payload.prompt
    if payload.sample_input_output is not None:
        question.sample_input_output = payload.sample_input_output
    if payload.starter_code is not None:
        question.starter_code = payload.starter_code
    if payload.tags is not None:
        question.tags = ",".join(tag.strip() for tag in payload.tags if tag.strip())

    db.add(question)
    await db.commit()
    await db.refresh(question)
    return serialize_question(question)


@router.delete("/{question_id}")
async def delete_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    _: str = Depends(require_admin),
) -> dict[str, bool]:
    result = await db.exec(select(Question).where(Question.id == question_id))
    question = result.first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    linked_room_result = await db.exec(
        select(RoomQuestionLink).where(RoomQuestionLink.question_id == question.id)
    )
    if linked_room_result.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Question is used by one or more rooms and cannot be deleted.",
        )

    await db.delete(question)
    await db.commit()
    return {"deleted": True}
