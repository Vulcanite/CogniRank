import uuid

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Question, RoomQuestionLink
from app.schemas import QuestionResponse


def serialize_question(question: Question) -> QuestionResponse:
    return QuestionResponse(
        id=question.id,
        slug=question.slug,
        title=question.title,
        difficulty=question.difficulty,
        prompt=question.prompt,
        sample_input_output=question.sample_input_output,
        starter_code=question.starter_code,
        tags=[tag for tag in question.tags.split(",") if tag],
    )


async def get_room_questions(room_id: uuid.UUID, db: AsyncSession) -> list[Question]:
    result = await db.exec(
        select(Question)
        .join(RoomQuestionLink, RoomQuestionLink.question_id == Question.id)
        .where(RoomQuestionLink.room_id == room_id)
        .order_by(RoomQuestionLink.order_index)
    )
    return list(result.all())
