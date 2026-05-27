import json
import uuid
from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import ChatMessage, InterviewReport, Question, Room, Session
from app.schemas import InterviewReportResponse
from app.services.code_snapshots import get_code_snapshots
from app.config import settings
from app.services.configuration import get_ai_configuration
from app.services.ai import generate_chat_completion

def serialize_report(report: InterviewReport) -> InterviewReportResponse:
    try:
        rubric = json.loads(report.rubric_json)
    except json.JSONDecodeError:
        rubric = {}
    return InterviewReportResponse(
        id=report.id,
        session_id=report.session_id,
        summary=report.summary,
        recommendation=report.recommendation,
        rubric=rubric,
        created_at=report.created_at,
    )


async def get_report_for_session(
    session_id: uuid.UUID,
    db: AsyncSession,
) -> InterviewReport | None:
    result = await db.exec(select(InterviewReport).where(InterviewReport.session_id == session_id))
    return result.first()


def _recommendation(tokens_used: int, message_count: int, code: str) -> str:
    if not code.strip():
        return "No submission"
    if message_count >= 8 and tokens_used > 0:
        return "Needs review"
    return "Review recommended"


async def create_or_update_report(
    session: Session,
    room: Room,
    questions: list[Question],
    messages: list[ChatMessage],
    db: AsyncSession,
) -> InterviewReport:
    existing = await get_report_for_session(session.id, db)
    assistant_messages = [message for message in messages if message.role == "assistant"]
    user_messages = [message for message in messages if message.role == "user"]
    assistant_code_messages = [
        message for message in assistant_messages if "```" in message.message or "<tool_call>" in message.message
    ]
    code_snapshots = await get_code_snapshots(session.id, questions, db)
    final_code = "\n\n".join(snapshot.final_code for snapshot in code_snapshots)
    code_lines = len([line for line in final_code.splitlines() if line.strip()])
    changed_questions = sum(1 for snapshot in code_snapshots if snapshot.diff)
    question_titles = ", ".join(question.title for question in questions) or room.title

    from app.models import TelemetryEvent
    from app.services.telemetry import calculate_suspicious_flags

    telemetry_result = await db.exec(
        select(TelemetryEvent).where(TelemetryEvent.session_id == session.id)
    )
    events = telemetry_result.all()
    flags = calculate_suspicious_flags(events)

    rubric = {
        "question_count": len(questions),
        "questions_changed_from_template": changed_questions,
        "chat_turns": len(user_messages),
        "assistant_turns": len(assistant_messages),
        "assistant_code_messages": len(assistant_code_messages),
        "tokens_used": session.tokens_used,
        "max_tokens": room.max_tokens,
        "non_empty_code_lines": code_lines,
        "completed_at": (session.ended_at or datetime.now(timezone.utc)).isoformat(),
        "suspicious_flags": flags,
    }

    # Generate Report using LLM Configuration
    summary = ""
    recommendation = ""

    ai_config = await get_ai_configuration(db)

    if settings.openrouter_api_key:
        # Build prompt variables
        user_prompt_content = (
            f"Candidate Name: {session.candidate_name}\n"
            f"Candidate Email: {session.candidate_email}\n"
            f"Room: {room.title}\n"
            f"Questions and Templates:\n"
        )
        for q in questions:
            user_prompt_content += f"- Question: {q.title}\n  Prompt: {q.prompt}\n"

        user_prompt_content += "\nCandidate's Final Submissions:\n"
        for snapshot in code_snapshots:
            user_prompt_content += f"- Question: {snapshot.question_title}\n  Final Code:\n{snapshot.final_code}\n"

        user_prompt_content += "\nAssistant Involvement Facts:\n"
        if assistant_code_messages:
            user_prompt_content += (
                f"- Assistant produced code in {len(assistant_code_messages)} message(s). "
                "Do not describe the final implementation as independently written by the candidate unless the transcript clearly supports that.\n"
            )
        else:
            user_prompt_content += "- No assistant code block messages detected.\n"

        user_prompt_content += "\nCandidate Observed Telemetry Facts:\n"
        for flag in flags:
            user_prompt_content += f"- Telemetry Alert: {flag}\n"
        if not flags:
            user_prompt_content += "- No suspicious telemetry observed.\n"

        user_prompt_content += "\nCandidate-AI Chat Transcript:\n"
        for msg in messages:
            user_prompt_content += f"[{msg.role.upper()}]: {msg.message}\n"

        try:
            llm_response = await generate_chat_completion(
                settings.openrouter_api_key,
                ai_config.api_url,
                ai_config.model,
                [
                    {"role": "system", "content": ai_config.report_prompt},
                    {"role": "user", "content": user_prompt_content},
                ]
            )

            # Strip markdown json block wrappers if LLM returned them
            cleaned = llm_response.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()

            parsed = json.loads(cleaned)
            summary = parsed.get("summary", "")
            recommendation = parsed.get("recommendation", "")[:40] # cap length just in case
        except Exception:
            # Fallback to full raw response as summary if it wasn't valid JSON
            if 'llm_response' in locals() and llm_response.strip():
                summary = llm_response.strip()
                recommendation = _recommendation(session.tokens_used, len(user_messages), final_code)

    # Clean Fallback if LLM request failed or wasn't run
    if not summary:
        summary = (
            f"{session.candidate_name} completed '{room.title}' covering {question_titles}. "
            f"The final per-question snapshots have {code_lines} non-empty code lines, with "
            f"{changed_questions} question(s) changed from starter templates and "
            f"{len(user_messages)} candidate chat prompt(s). Assistant code block messages: "
            f"{len(assistant_code_messages)}. "
            "This report is based on saved code and chat history only; no sandbox execution was run."
        )
    if not recommendation:
        recommendation = _recommendation(session.tokens_used, len(user_messages), final_code)

    if existing is None:
        report = InterviewReport(
            session_id=session.id,
            summary=summary,
            recommendation=recommendation,
            rubric_json=json.dumps(rubric),
        )
    else:
        report = existing
        report.summary = summary
        report.recommendation = recommendation
        report.rubric_json = json.dumps(rubric)
        report.created_at = datetime.now(timezone.utc)

    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report
