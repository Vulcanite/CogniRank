# CogniRank - Technical Project Explanation

This document summarizes the current CogniRank codebase as implemented in the local FastAPI backend and Next.js frontend.

---

## 1. Project Objective

CogniRank is an AI-assisted coding interview platform for running timed, invite-only technical screens. Admins create rooms from a reusable question bank, candidates solve one or more coding questions in a Monaco editor, and a restricted LLM "rubber duck" can guide the candidate without revealing an algorithmic strategy before the candidate explains their own approach. Completed sessions produce per-question final code snapshots, starter-code diffs, transcript history, telemetry flags, and an LLM-generated report.

The assistant is intentionally constrained:

1. It should not design the algorithm for the candidate.
2. It should not provide implementation code until the candidate has stated an approach and justification.
3. It should explain problem statements using goals, inputs, outputs, constraints, and examples, without leaking algorithm/data-structure hints.
4. If code is generated, the UI shows an `Apply to Editor` action; code is not silently written into Monaco.
5. Admins can enable an editable brute-force enforcement prompt to test whether candidates notice and correct inefficient generated code.

---

## 2. Runtime Stack

| Layer                      | Implementation                                                                   |
|----------------------------|----------------------------------------------------------------------------------|
| Backend                    | FastAPI, SQLModel, SQLAlchemy async engine                                       |
| Backend package management | `pyproject.toml` + `uv.lock`, managed by `uv`                                    |
| Database                   | PostgreSQL by default; compatibility code also handles SQLite table rename paths |
| LLM client                 | OpenAI Python SDK with configurable OpenAI-compatible base URL                   |
| Frontend                   | Next.js 16, React 19, TypeScript, Tailwind CSS                                   |
| Editor                     | Monaco via `@monaco-editor/react`                                                |

Backend dependency source of truth:

```text
backend/pyproject.toml
backend/uv.lock
```

`requirements.txt` has been removed.

---

## 3. Directory Structure

```text
backend/
  pyproject.toml        # backend project metadata and runtime dependencies
  uv.lock               # locked dependency resolution
  app/
    main.py             # FastAPI app registration, CORS, router mounting
    config.py           # Pydantic settings: DATABASE_URL, LLM_PROVIDER_*, admin auth
    database.py         # async engine/session, create_all bootstrap, compatibility migrations
    models.py           # SQLModel table definitions
    schemas.py          # Pydantic request/response DTOs
    seed.py             # default question bank and LLM configuration seed
    routers/
      admin.py          # admin settings, history, reports, observer live-code endpoints
      auth.py           # admin login/refresh
      questions.py      # question bank CRUD
      rooms.py          # room creation and candidate join
      sessions.py       # candidate state, code sync, chat, telemetry, heartbeat, end
    services/
      llm.py            # OpenAI SDK chat streaming, completion, model listing
      auth.py           # admin token helpers
      candidate_access.py
      code_snapshots.py # per-question code rows and unified diffs
      configuration.py  # LLM configuration persistence
      live_code.py      # in-process SSE pub/sub for observer mode
      questions.py
      reports.py        # report generation and fallback report facts
      room_code.py
      session_lifecycle.py
      telemetry.py
  scripts/
    clear_round_history.py

frontend/
  src/app/
    page.tsx
    join/page.tsx
    interview/[sessionId]/page.tsx
    admin/page.tsx
    admin/config/page.tsx
    admin/history/page.tsx
    admin/observe/[sessionId]/page.tsx
    admin/questions/page.tsx
  src/components/
    admin-login.tsx
    admin-shell.tsx
    interview-dashboard.tsx
    theme-toggle.tsx
    ui/
  src/lib/
    api.ts
    admin-auth.ts
    candidate-session.ts
    use-admin-auth.ts
    utils.ts
```

---

## 4. Database Schema

The schema is defined in `backend/app/models.py`.

| Table                    | Purpose                                                                                      |
|--------------------------|----------------------------------------------------------------------------------------------|
| `organizations`          | Owns rooms                                                                                   |
| `rooms`                  | Invite-gated coding round configuration and generated room code                              |
| `questions`              | Reusable question bank: title, difficulty, problem statement, sample I/O, starter code, tags |
| `room_questions`         | Many-to-many room/question ordering table                                                    |
| `sessions`               | Candidate interview state, status, timer, access lease, token counters                       |
| `session_question_codes` | Per-session, per-question code state                                                         |
| `chat_messages`          | Candidate and assistant transcript, scoped by nullable `question_id`                         |
| `interview_reports`      | One report per session                                                                       |
| `llm_configuration`      | Runtime LLM URL, model, prompts, API key secret, brute-force flag                            |
| `telemetry_events`       | Candidate interaction telemetry                                                              |

Important relationship outline:

```text
organizations.id -> rooms.org_id
rooms.id -> sessions.room_id
rooms.id -> room_questions.room_id
questions.id -> room_questions.question_id
sessions.id -> session_question_codes.session_id
questions.id -> session_question_codes.question_id
sessions.id -> chat_messages.session_id
questions.id -> chat_messages.question_id
sessions.id -> interview_reports.session_id
sessions.id -> telemetry_events.session_id
```

Schema evolution is currently handled in `backend/app/database.py` with `SQLModel.metadata.create_all()` plus compatibility `ALTER TABLE` statements. A formal migration tool such as Alembic is not currently configured.

The LLM configuration table is singular: `llm_configuration`. Startup compatibility code renames old table names (`ai_configuration`, `ai_configurations`, accidental `llm_configurations`) to `llm_configuration`.

---

## 5. LLM Configuration

Environment-backed defaults live in `backend/app/config.py`:

```text
LLM_PROVIDER_KEY
LLM_PROVIDER_URL
LLM_PROVIDER_MODEL
```

Legacy `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` fallback support has been removed.

Admins can edit runtime LLM behavior from `/admin/config`:

- LLM provider URL
- write-only LLM provider key
- model selection, loaded from provider models API
- rubber-duck system prompt
- active-question context prompt
- brute-force enforcement prompt
- report prompt
- brute-force enforcement toggle

The backend uses the saved key from `llm_configuration.api_key_secret` first, then `LLM_PROVIDER_KEY` from environment.

---

## 6. Candidate Workspace

The candidate workspace is implemented by `frontend/src/components/interview-dashboard.tsx`.

It has three main working regions:

1. Left: question selector, active problem statement, structured sample input and expected output.
2. Center: Monaco editor for the active question's code.
3. Right: question-scoped LLM chat.

Code is tracked per question in `session_question_codes`. Switching questions swaps both editor content and chat history to the active question.

The assistant response renderer extracts markdown code blocks and shows each with an `Apply to Editor` button. Applying code explicitly updates the active question's editor state and syncs it to the backend.

---

## 7. Question Bank

Question management is implemented at `/admin/questions`.

Current behavior:

- add/edit questions in a modal
- title, difficulty, tags, problem statement, sample input, expected output, starter code
- tags are displayed as pills in the UI
- sample input and output are separate fields in the frontend editor
- backend still stores sample I/O as a single `sample_input_output` string for compatibility
- deletion is blocked when a question is already linked to a room

The backend still uses the field name `prompt` for the problem statement in API/schema/model code, but the UI labels it as "Problem Statement."

---

## 8. Room Creation And Access Control

Admins build rounds from `/admin`:

- select one or more questions
- set room title
- enter mandatory invite email
- set round timer
- generate a six-character room code

Room generation creates a room and an inactive session so it appears in history before the candidate starts.

Candidate join flow:

1. Candidate opens `/join`.
2. Candidate enters name, email, and room code.
3. Backend validates invite email and room state.
4. Backend activates the inactive session.
5. Candidate receives a session token.
6. Candidate is redirected to `/interview/{sessionId}`.

Only one candidate interview session/client is allowed for an active session. Admin observer sessions are unlimited.

Session states:

| State | Meaning |
| --- | --- |
| `inactive` | Room generated, candidate has not started |
| `active` | Candidate joined and timer is running |
| `completed` | Candidate or admin ended the session |
| `expired` | Timer elapsed and the session was closed |

Completed or expired room codes are rejected as invalid if reused.

---

## 9. Live Observation

Observer mode is implemented at `/admin/observe/{sessionId}`.

Live code updates use:

- candidate endpoint: `/api/session/{session_id}/live-code`
- admin endpoint: `/api/admin/sessions/{session_id}/live-code`
- in-process pub/sub: `backend/app/services/live_code.py`

The candidate frontend sends fast live-code updates while also performing durable debounced code sync. Observer mode displays the candidate-style problem/editor surface in read-only mode and refreshes session/chat details periodically.

`LiveCodeHub` is process-local. It is suitable for single-process local development. Multi-worker or multi-instance production deployment would need Redis, Postgres LISTEN/NOTIFY, or another shared pub/sub layer.

---

## 10. Telemetry

Telemetry is recorded through `/api/session/{session_id}/telemetry`.

Supported events are defined in `backend/app/schemas.py`:

- `typing_speed_sample`
- `tab_visibility_changed`
- `copy_attempt_blocked`
- `cut_attempt_blocked`
- `paste_attempt_blocked`
- `copy_shortcut_blocked`
- `cut_shortcut_blocked`
- `paste_shortcut_blocked`

The frontend disables copy/cut/paste interactions in the editor and question surface and records blocked attempts. Tab visibility changes are also recorded. The report/history view shows suspicious flags derived by `backend/app/services/telemetry.py`.

---

## 11. Report Generation

Reports are generated when a session ends or when an admin closes/regenerates a completed session.

The report service receives:

- candidate identity
- room title
- question set
- starter template code
- final submitted code
- per-question unified diff
- assistant involvement facts
- telemetry flags
- question-scoped chat transcript

The report prompt includes guardrails:

- starter/template code must not be credited as candidate work
- imports, function signatures, input parsing, print calls, comments, and placeholders from starter code are not candidate strengths
- no-diff questions must be treated as no candidate implementation
- code evaluation must stay separate from the full interview report
- telemetry must be treated as signal only, not proof of intent

The History UI renders:

- recommendation
- markdown interview report
- report metrics
- final code per question
- diff from starter template
- code-only evaluation
- question set
- transcript with role filters
- telemetry events/flags

---

## 12. Authentication

Admin authentication:

- `/api/auth/login`
- `/api/auth/refresh`
- bearer token protected routes via `require_admin`

Candidate authentication:

- `X-Session-Token`
- `X-Client-Id`

`candidate_access.py` enforces a 30-second active client lease. If a second tab/browser tries to use the same active candidate session during the lease, the backend returns a conflict. The frontend also uses `BroadcastChannel` to detect duplicate tabs earlier.

---

## 13. Current Production Readiness Notes

Implemented:

- PostgreSQL-backed persistence
- Docker Compose PostgreSQL service
- admin authentication
- invite email + room code gating
- timed sessions and expiry
- single candidate active client lock
- unlimited observer sessions
- question bank CRUD
- per-question code and chat isolation
- explicit assistant-code apply flow
- LLM provider settings
- prompt configurability
- live observer view
- telemetry capture
- generated reports with code diffs
- `pyproject.toml` + `uv.lock` backend dependency management

Pending or technical friction:

- No formal Alembic migration setup yet.
- `LiveCodeHub` is in-memory and not multi-instance safe.
- Sample input/output is split in the frontend but stored as one backend string.
- Backend model/API still uses the field name `prompt`; UI calls it "Problem Statement."
- Token counters remain in backend/session DTOs, though they are not intended as candidate-facing UI.
- LLM report quality depends on the configured model and prompt compliance.
