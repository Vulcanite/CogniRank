import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RoomCreateRequest(BaseModel):
    org_name: str = "Default Organization"
    title: str
    problem_statement: str | None = None
    sample_input_output: str | None = None
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
    title: str = Field(min_length=1)
    difficulty: str = Field(pattern="^(Easy|Medium|Hard)$")
    prompt: str = Field(min_length=1)
    sample_input_output: str = Field(min_length=1)
    starter_code: str = ""
    tags: list[str] = Field(default_factory=list)


class QuestionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    difficulty: str | None = Field(default=None, pattern="^(Easy|Medium|Hard)$")
    prompt: str | None = Field(default=None, min_length=1)
    sample_input_output: str | None = Field(default=None, min_length=1)
    starter_code: str | None = None
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
    candidate_name: str
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
    current_code: str
    question_id: uuid.UUID | None = None


class LiveCodeRequest(BaseModel):
    current_code: str
    question_id: uuid.UUID


class SyncCodeResponse(BaseModel):
    updated_at: datetime


class SessionHeartbeatResponse(BaseModel):
    status: str
    lease_expires_at: datetime | None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class TelemetryRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    metadata: dict = Field(default_factory=dict)


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
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


class AIConfigurationResponse(BaseModel):
    api_url: str
    model: str
    system_prompt: str
    report_prompt: str
    force_brute_force: bool
    updated_at: datetime


class AIConfigurationUpdateRequest(BaseModel):
    api_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
    system_prompt: str = Field(min_length=1)
    report_prompt: str = Field(min_length=1)
    force_brute_force: bool = Field(default=False)


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
