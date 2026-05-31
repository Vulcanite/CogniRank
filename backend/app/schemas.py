import uuid
from datetime import datetime
import json
from urllib.parse import urlparse

from pydantic import BaseModel, EmailStr, Field, field_validator


ALLOWED_TELEMETRY_EVENTS = {
    "typing_speed_sample",
    "tab_visibility_changed",
    "copy_attempt_blocked",
    "cut_attempt_blocked",
    "paste_attempt_blocked",
    "copy_shortcut_blocked",
    "cut_shortcut_blocked",
    "paste_shortcut_blocked",
}


class RoomCreateRequest(BaseModel):
    org_name: str = Field(default="Default Organization", min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    problem_statement: str | None = Field(default=None, max_length=20000)
    sample_input_output: str | None = Field(default=None, max_length=10000)
    max_tokens: int = Field(gt=0)
    invite_email: EmailStr
    duration_minutes: int = Field(default=60, gt=0)
    question_ids: list[uuid.UUID] = Field(default_factory=list)


class QuestionResponse(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    difficulty: str
    prompt: str
    sample_input_output: str
    starter_code: str
    tags: list[str]


class QuestionCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    difficulty: str = Field(pattern="^(Easy|Medium|Hard)$")
    prompt: str = Field(min_length=1, max_length=20000)
    sample_input_output: str = Field(min_length=1, max_length=10000)
    starter_code: str = Field(default="", max_length=100000)
    tags: list[str] = Field(default_factory=list)


class QuestionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    difficulty: str | None = Field(default=None, pattern="^(Easy|Medium|Hard)$")
    prompt: str | None = Field(default=None, min_length=1, max_length=20000)
    sample_input_output: str | None = Field(default=None, min_length=1, max_length=10000)
    starter_code: str | None = Field(default=None, max_length=100000)
    tags: list[str] | None = None


class RoomCreateResponse(BaseModel):
    room_id: uuid.UUID
    room_code: str
    title: str
    max_tokens: int
    invite_email: str | None
    duration_minutes: int
    questions: list[QuestionResponse]


class RoomJoinRequest(BaseModel):
    room_code: str = Field(min_length=6, max_length=6)
    candidate_name: str = Field(min_length=1, max_length=120)
    candidate_email: EmailStr


class RoomJoinResponse(BaseModel):
    session_id: uuid.UUID
    session_token: str
    room_title: str
    problem_statement: str
    sample_input_output: str
    questions: list[QuestionResponse]
    max_tokens: int
    tokens_used: int
    token_limit_hit: bool
    status: str
    expires_at: datetime | None


class SyncCodeRequest(BaseModel):
    current_code: str = Field(max_length=200000)
    question_id: uuid.UUID | None = None


class LiveCodeRequest(BaseModel):
    current_code: str = Field(max_length=200000)
    question_id: uuid.UUID


class SyncCodeResponse(BaseModel):
    updated_at: datetime


class SessionHeartbeatResponse(BaseModel):
    status: str
    lease_expires_at: datetime | None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    question_id: uuid.UUID | None = None


class TelemetryRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    metadata: dict = Field(default_factory=dict)

    @field_validator("event_type")
    @classmethod
    def event_type_must_be_known(cls, value: str) -> str:
        if value not in ALLOWED_TELEMETRY_EVENTS:
            raise ValueError("Unsupported telemetry event")
        return value

    @field_validator("metadata")
    @classmethod
    def metadata_must_be_bounded(cls, value: dict) -> dict:
        if len(json.dumps(value, default=str)) > 4096:
            raise ValueError("Telemetry metadata is too large")
        return value


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID | None = None
    role: str
    message: str
    timestamp: datetime


class SessionStateResponse(BaseModel):
    session_id: uuid.UUID
    room_title: str
    problem_statement: str
    sample_input_output: str
    questions: list[QuestionResponse]
    current_code: str
    max_tokens: int
    tokens_used: int
    token_limit_hit: bool
    status: str
    ended_at: datetime | None
    expires_at: datetime | None
    code_by_question: dict[uuid.UUID, str]
    messages: list[ChatMessageResponse]


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    username: str


class LLMConfigurationResponse(BaseModel):
    api_url: str
    api_key_configured: bool = False
    model: str
    system_prompt: str
    chat_context_prompt: str
    brute_force_prompt: str
    report_prompt: str
    force_brute_force: bool
    updated_at: datetime


class LLMConfigurationUpdateRequest(BaseModel):
    api_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = Field(default=None, max_length=4000)
    model: str = Field(min_length=1, max_length=200)
    system_prompt: str = Field(min_length=1, max_length=20000)
    chat_context_prompt: str = Field(min_length=1, max_length=20000)
    brute_force_prompt: str = Field(min_length=1, max_length=20000)
    report_prompt: str = Field(min_length=1, max_length=20000)
    force_brute_force: bool = Field(default=False)

    @field_validator("api_url")
    @classmethod
    def api_url_must_be_http(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("LLM provider URL must be an HTTP(S) URL")
        return value.rstrip("/")

    @field_validator("api_key")
    @classmethod
    def api_key_blank_means_unchanged(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

class LLMModelListRequest(BaseModel):
    api_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=4000)

    @field_validator("api_url")
    @classmethod
    def optional_api_url_must_be_http(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("LLM provider URL must be an HTTP(S) URL")
        return value.rstrip("/")

    @field_validator("api_key")
    @classmethod
    def optional_api_key_blank_means_missing(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class LLMModelListResponse(BaseModel):
    models: list[str]


class InterviewReportResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    summary: str
    recommendation: str
    rubric: dict
    created_at: datetime


class AdminSessionSummaryResponse(BaseModel):
    session_id: uuid.UUID
    room_id: uuid.UUID
    room_title: str
    room_code: str
    candidate_name: str
    candidate_email: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    expires_at: datetime | None
    updated_at: datetime
    tokens_used: int
    max_tokens: int
    duration_minutes: int
    invite_email: str | None
    question_count: int
    report_ready: bool
    suspicious_flags: list[str] = Field(default_factory=list)


class CodeSnapshotResponse(BaseModel):
    question_id: uuid.UUID
    question_title: str
    starter_code: str
    final_code: str
    diff: list[str]
    updated_at: datetime | None


class TelemetryEventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    metadata: dict
    timestamp: datetime


class AdminSessionDetailResponse(AdminSessionSummaryResponse):
    current_code: str
    questions: list[QuestionResponse]
    code_snapshots: list[CodeSnapshotResponse]
    messages: list[ChatMessageResponse]
    telemetry: list[TelemetryEventResponse]
    report: InterviewReportResponse | None


class EndSessionResponse(BaseModel):
    status: str
    ended_at: datetime
    report: InterviewReportResponse
