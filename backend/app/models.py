import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Text
from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str

    rooms: list["Room"] = Relationship(back_populates="organization")


class Room(SQLModel, table=True):
    __tablename__ = "rooms"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    org_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    )
    room_code: str = Field(max_length=6, unique=True, index=True)
    title: str
    problem_statement: str = Field(sa_column=Column(Text, nullable=False))
    sample_input_output: str = Field(sa_column=Column(Text, nullable=False))
    max_tokens: int
    invite_email: str | None = Field(default=None, index=True)
    duration_minutes: int = Field(default=60)
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    organization: Organization = Relationship(back_populates="rooms")
    sessions: list["Session"] = Relationship(back_populates="room")


class Question(SQLModel, table=True):
    __tablename__ = "questions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    slug: str = Field(unique=True, index=True)
    title: str
    difficulty: str = Field(max_length=20)
    prompt: str = Field(sa_column=Column(Text, nullable=False))
    sample_input_output: str = Field(sa_column=Column(Text, nullable=False))
    starter_code: str = Field(default="", sa_column=Column(Text, nullable=False))
    tags: str = Field(default="")
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class RoomQuestionLink(SQLModel, table=True):
    __tablename__ = "room_questions"

    room_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("rooms.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    question_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("questions.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    order_index: int = Field(default=0)


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    room_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    )
    candidate_email: str
    candidate_name: str
    current_code: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: str = Field(default="active", max_length=20)
    tokens_used: int = Field(default=0)
    token_limit_hit: bool = Field(default=False)
    candidate_access_token_hash: str | None = Field(default=None, max_length=128)
    active_client_id: str | None = Field(default=None, max_length=128)
    client_lease_expires_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    started_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    ended_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    expires_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    room: Room = Relationship(back_populates="sessions")
    messages: list["ChatMessage"] = Relationship(back_populates="session")


class SessionQuestionCode(SQLModel, table=True):
    __tablename__ = "session_question_codes"

    session_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("sessions.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    question_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("questions.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        )
    )
    current_code: str = Field(default="", sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    )
    role: str = Field(max_length=20)
    message: str = Field(sa_column=Column(Text, nullable=False))
    timestamp: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    session: Session = Relationship(back_populates="messages")


class InterviewReport(SQLModel, table=True):
    __tablename__ = "interview_reports"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("sessions.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        )
    )
    summary: str = Field(sa_column=Column(Text, nullable=False))
    recommendation: str = Field(max_length=40)
    rubric_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class AIConfiguration(SQLModel, table=True):
    __tablename__ = "ai_configuration"

    id: str = Field(default="default", primary_key=True, max_length=40)
    api_url: str
    model: str
    system_prompt: str = Field(sa_column=Column(Text, nullable=False))
    report_prompt: str = Field(sa_column=Column(Text, nullable=False))
    force_brute_force: bool = Field(default=False)
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class TelemetryEvent(SQLModel, table=True):
    __tablename__ = "telemetry_events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    )
    event_type: str = Field(max_length=80, index=True)
    metadata_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    timestamp: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
