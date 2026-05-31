import json
import uuid
from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import ChatMessage, InterviewReport, Question, Room, Session
from app.schemas import InterviewReportResponse
from app.services.code_snapshots import get_code_snapshots
from app.config import settings
from app.services.configuration import get_llm_configuration
from app.services.llm import generate_chat_completion


REPORT_EVALUATION_GUARDRAILS = """Non-negotiable report evaluation rules:
- Starter/template code is platform-provided and must not be credited as candidate work.
- Do not list imports, function signatures, main/input parsing, print calls, comments, or placeholder structure as candidate strengths when those lines come from the starter template.
- Use the per-question unified diff as the primary evidence of candidate implementation.
- If a question has no diff from the starter template, state that no candidate implementation was submitted for that question.
- Credit only candidate-authored changes and candidate-stated reasoning from the transcript.
- If the candidate only acknowledged the problem without implementing or explaining a concrete solution, do not describe that as a strength.
"""


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


def _parse_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(cleaned):
            if char != "{":
                continue
            try:
                parsed, _ = decoder.raw_decode(cleaned[index:])
            except json.JSONDecodeError:
                continue
            return parsed if isinstance(parsed, dict) else {}
    return {}


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
        "non_empty_code_lines": code_lines,
        "completed_at": (session.ended_at or datetime.now(timezone.utc)).isoformat(),
        "suspicious_flags": flags,
        "code_evaluation": "",
    }

    # Generate Report using LLM Configuration
    summary = ""
    recommendation = ""

    llm_config = await get_llm_configuration(db)

    llm_api_key = llm_config.api_key_secret or settings.llm_provider_key

    if llm_api_key:
        # Build prompt variables
        user_prompt_content = (
            f"Candidate Name: {session.candidate_name}\n"
            f"Candidate Email: {session.candidate_email}\n"
            f"Room: {room.title}\n"
            f"Questions and Templates:\n"
        )
        for q in questions:
            user_prompt_content += (
                f"- Question: {q.title}\n"
                f"  Prompt: {q.prompt}\n"
                f"  Starter Template Code:\n{q.starter_code}\n"
            )

        user_prompt_content += "\nCandidate's Final Submissions and Template Diffs:\n"
        for snapshot in code_snapshots:
            diff_text = "\n".join(snapshot.diff) if snapshot.diff else "No changes from starter template."
            user_prompt_content += (
                f"- Question: {snapshot.question_title}\n"
                f"  Changed From Starter: {'yes' if snapshot.diff else 'no'}\n"
                f"  Final Code:\n{snapshot.final_code}\n"
                f"  Unified Diff From Starter Template:\n{diff_text}\n"
            )

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

        user_prompt_content += "\nCandidate Chat Transcript:\n"
        for msg in messages:
            user_prompt_content += f"[{msg.role.upper()}]: {msg.message}\n"

        try:
            llm_response = await generate_chat_completion(
                llm_api_key,
                llm_config.api_url,
                llm_config.model,
                [
                    {"role": "system", "content": f"{llm_config.report_prompt}\n\n{REPORT_EVALUATION_GUARDRAILS}"},
                    {"role": "user", "content": user_prompt_content},
                ]
            )

            parsed = _parse_json_object(llm_response)
            if not parsed:
                raise ValueError("LLM report response did not contain a JSON object")
            summary = parsed.get("summary", "")
            code_evaluation = parsed.get("code_evaluation", "")
            if isinstance(code_evaluation, str):
                rubric["code_evaluation"] = code_evaluation
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
    if not rubric["code_evaluation"]:
        if not final_code.strip():
            rubric["code_evaluation"] = "No final code was synced for evaluation."
        else:
            rubric["code_evaluation"] = (
                f"Final code exists for {changed_questions} of {len(questions)} question(s) with "
                f"{code_lines} non-empty line(s). Review the per-question final code and template diff above "
                "for correctness, complexity, edge-case handling, and implementation quality. No sandbox execution "
                "results are available in this report."
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
