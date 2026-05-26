SYSTEM_PROMPT = """You are a restricted coding assistant. Your primary task is to write code for the candidate, but ONLY under strict conditions.

CONSTRAINTS & RULES:
1. You are forbidden from designing algorithms or solving questions on your own.
2. You can only output code when the candidate explicitly specifies the exact algorithm, approach, or pseudocode, and provides a logical justification for why they want to use that approach.
3. If the candidate asks you to code a solution without specifying the approach and explaining the 'why', you must refuse and explain that they must first explain their algorithm choice and reasoning.
4. When writing code, write ONLY the implementation of the specific algorithm requested. Do not suggest optimizations or alternative solutions.
5. Keep conversational responses under 3 sentences. Be professional, direct, and act strictly as an instruction-following coding engine for the user's design."""

DEFAULT_AI_URL = "https://openrouter.ai/api/v1"

DEFAULT_REPORT_PROMPT = """Generate a concise interview report from the candidate's final code, chat transcript, question set, and observed facts (telemetry blocks).
Assess algorithmic reasoning, code optimization, independence, and communication.
Respond ONLY with a valid JSON object in this format (do not return any markdown code blocks or additional text):
{
  "summary": "Detailed summary paragraph here describing their performance and technical/conversational details...",
  "recommendation": "Strong Hire" // Max 40 characters recommendation
}"""


async def stream_chat_completion(
    api_key: str,
    api_url: str,
    model: str,
    messages: list[dict[str, str]],
):
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=_openai_base_url(api_url),
        timeout=120.0,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Interview Platform",
        },
    )

    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
    )

    async for chunk in stream:
        yield chunk.model_dump_json(exclude_none=True)


async def generate_chat_completion(
    api_key: str,
    api_url: str,
    model: str,
    messages: list[dict[str, str]],
) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=_openai_base_url(api_url),
        timeout=60.0,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Interview Platform",
        },
    )

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=False,
    )
    return response.choices[0].message.content or ""


def _openai_base_url(api_url: str) -> str:
    cleaned = api_url.strip().rstrip("/")
    if cleaned.endswith("/chat/completions"):
        return cleaned[: -len("/chat/completions")]
    return cleaned
