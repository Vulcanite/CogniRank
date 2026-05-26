import difflib
import uuid
from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Question, SessionQuestionCode
from app.schemas import CodeSnapshotResponse


async def ensure_question_code_rows(
    session_id: uuid.UUID,
    questions: list[Question],
    db: AsyncSession,
) -> None:
    for question in questions:
        result = await db.exec(
            select(SessionQuestionCode).where(
                SessionQuestionCode.session_id == session_id,
                SessionQuestionCode.question_id == question.id,
            )
        )
        if result.first() is None:
            db.add(
                SessionQuestionCode(
                    session_id=session_id,
                    question_id=question.id,
                    current_code=question.starter_code,
                )
            )


async def get_code_by_question(
    session_id: uuid.UUID,
    questions: list[Question],
    db: AsyncSession,
) -> dict[uuid.UUID, str]:
    await ensure_question_code_rows(session_id, questions, db)
    result = await db.exec(
        select(SessionQuestionCode).where(SessionQuestionCode.session_id == session_id)
    )
    rows = result.all()
    by_id = {row.question_id: row.current_code for row in rows}
    return {question.id: by_id.get(question.id, question.starter_code) for question in questions}


async def update_question_code(
    session_id: uuid.UUID,
    question_id: uuid.UUID,
    current_code: str,
    db: AsyncSession,
) -> None:
    result = await db.exec(
        select(SessionQuestionCode).where(
            SessionQuestionCode.session_id == session_id,
            SessionQuestionCode.question_id == question_id,
        )
    )
    row = result.first()
    if row is None:
        row = SessionQuestionCode(
            session_id=session_id,
            question_id=question_id,
            current_code=current_code,
        )
    else:
        row.current_code = current_code
        row.updated_at = datetime.now(timezone.utc)
    db.add(row)


async def get_code_snapshots(
    session_id: uuid.UUID,
    questions: list[Question],
    db: AsyncSession,
) -> list[CodeSnapshotResponse]:
    await ensure_question_code_rows(session_id, questions, db)
    result = await db.exec(
        select(SessionQuestionCode).where(SessionQuestionCode.session_id == session_id)
    )
    rows = {row.question_id: row for row in result.all()}
    snapshots: list[CodeSnapshotResponse] = []
    for question in questions:
        row = rows.get(question.id)
        final_code = row.current_code if row is not None else question.starter_code
        diff = list(
            difflib.unified_diff(
                question.starter_code.splitlines(),
                final_code.splitlines(),
                fromfile=f"{question.title} starter",
                tofile=f"{question.title} final",
                lineterm="",
            )
        )
        snapshots.append(
            CodeSnapshotResponse(
                question_id=question.id,
                question_title=question.title,
                starter_code=question.starter_code,
                final_code=final_code,
                diff=diff,
                updated_at=row.updated_at if row is not None else None,
            )
        )
    return snapshots
