# CogniRank

CogniRank is an AI-native coding interview platform with a FastAPI backend, PostgreSQL persistence, a Next.js admin console, and a Monaco-powered candidate workspace.

The admin console supports authenticated access, reusable question-bank management, timed invite-gated rooms, live observer mode, AI prompt/configuration management, telemetry review, and generated interview reports. Candidates join with a room code plus invited email, solve one or more coding questions, and can use a restricted AI assistant.

## Stack

| Layer | Implementation |
| --- | --- |
| Backend | FastAPI, SQLModel, SQLAlchemy async engine, asyncpg |
| Database | PostgreSQL 16 by default, Docker Compose service included |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Editor | Monaco via `@monaco-editor/react` |
| AI client | OpenAI Python SDK pointed at an OpenAI-compatible base URL |
| Default LLM provider URL | `https://openrouter.ai/api/v1` |

## Repository Layout

```text
backend/
  app/
    config.py                  # environment settings
    database.py                # async engine/session and create_all bootstrap
    main.py                    # FastAPI app, CORS, routers
    models.py                  # SQLModel table definitions
    schemas.py                 # request/response DTOs
    seed.py                    # default question bank and LLM config seed
    routers/
      admin.py                 # admin config, history, reports, live-code stream
      auth.py                  # admin login/refresh
      questions.py             # question bank CRUD
      rooms.py                 # room creation and candidate join
      sessions.py              # session state, code sync, chat, telemetry, end
    services/
      auth.py                  # signed admin bearer tokens
      candidate_access.py      # candidate token and single active client lease
      code_snapshots.py        # per-question code, starter/final diff
      configuration.py         # LLM configuration persistence
      live_code.py             # in-process SSE publish/subscribe hub
      llm.py                   # OpenAI SDK chat/report calls
      questions.py             # question querying and serialization
      reports.py               # report generation and fallback summary
      room_code.py             # unique 6-character room codes
      session_lifecycle.py     # completion/expiry handling
      telemetry.py             # telemetry persistence and suspicious flags
  scripts/
    clear_round_history.py     # maintenance script for deleting room/session history

frontend/
  src/app/
    admin/page.tsx                         # dashboard and room builder
    admin/config/page.tsx                  # AI settings page
    admin/history/page.tsx                 # round history and report review
    admin/observe/[sessionId]/page.tsx     # read-only observer view
    admin/questions/page.tsx               # question bank management
    interview/[sessionId]/page.tsx         # candidate interview route
    join/page.tsx                          # candidate room-code entry
    globals.css                            # global styles and design tokens
    layout.tsx                             # theme bootstrap and app shell
    page.tsx                               # main landing page with navigation
  src/components/
    admin-login.tsx
    admin-shell.tsx
    interview-dashboard.tsx
    theme-toggle.tsx
    ui/
      badge.tsx                            # custom badge component
      button.tsx                           # custom button component
      card.tsx                             # custom card component
      input.tsx                            # custom input text component
      scroll-area.tsx                      # custom scroll container component
      textarea.tsx                         # custom textarea text component
  src/lib/
    admin-auth.ts
    api.ts
    candidate-session.ts
    use-admin-auth.ts
    utils.ts
```

## Prerequisites

- Python 3.11+
- uv
- Node.js 20+
- PostgreSQL 16, either through Docker Compose or a local service

## Environment

Backend settings are read from `backend/.env`.

```bash
cd backend
cp .env.example .env
```

Important backend variables:

| Variable | Default / Purpose |
| --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://interview:interview@localhost:5432/interview_platform` |
| `LLM_PROVIDER_KEY` | Required for AI chat, model fetching, and LLM report generation unless configured in Settings |
| `LLM_PROVIDER_URL` | OpenAI-compatible provider base URL used when the LLM config row is first seeded |
| `LLM_PROVIDER_MODEL` | Default model used when the LLM config row is first seeded |
| `CORS_ORIGINS` | Frontend origins allowed by FastAPI |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Local admin credentials |
| `ADMIN_SECRET_KEY` | HMAC signing key for admin bearer tokens |
| `ADMIN_TOKEN_TTL_MINUTES` | Admin token lifetime |

Frontend settings are read from `frontend/.env.local`.

```bash
cd frontend
cp .env.local.example .env.local
```

| Variable | Default / Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` |

## Local Development

Start PostgreSQL with Docker:

```bash
docker compose up -d postgres
```

Or initialize a local PostgreSQL database:

```bash
psql -U postgres -f scripts/setup-db.sql
```

Start the backend:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Default local admin credentials from `backend/.env.example`:

| Username | Password |
| --- | --- |
| `admin` | `admin123` |

Change these before sharing the app beyond local development.

## Database Layer

The backend uses SQLModel table classes in `backend/app/models.py`.

Active tables:

| Table | Purpose |
| --- | --- |
| `organizations` | Owns rooms |
| `rooms` | Invite-gated coding round configuration and generated room code |
| `questions` | Reusable question bank with prompt, sample IO, tags, and starter code |
| `room_questions` | Many-to-many room/question ordering table |
| `sessions` | Candidate interview state, status, current code, timer, token counters, access lease |
| `session_question_codes` | Per-session, per-question final code snapshots |
| `chat_messages` | Candidate and assistant transcript |
| `interview_reports` | One generated report per session |
| `llm_configuration` | Runtime LLM URL, model, system prompt, report prompt, brute-force flag |
| `telemetry_events` | Session telemetry events and metadata |

Relationship outline:

```text
organizations.id -> rooms.org_id
rooms.id -> sessions.room_id
rooms.id -> room_questions.room_id
questions.id -> room_questions.question_id
sessions.id -> chat_messages.session_id
sessions.id -> session_question_codes.session_id
questions.id -> session_question_codes.question_id
sessions.id -> interview_reports.session_id
sessions.id -> telemetry_events.session_id
```

`backend/app/database.py` creates the async engine from `DATABASE_URL`, initializes `async_session`, calls `SQLModel.metadata.create_all`, applies a small set of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` compatibility updates, then seeds default questions and default LLM configuration.

Pending / not started: a formal migration tool such as Alembic is not configured. Schema evolution is currently handled in `init_db()`.

## Seeded Questions

`backend/app/seed.py` inserts these questions when missing:

- Two Sum Indices
- Valid Parentheses
- Merge Intervals
- First Non-Repeating Character
- Top K Frequent Elements
- Minimum Covering Window

Each seeded question includes difficulty, tags, prompt, sample input/output, and Python starter code that reads from stdin.

## Admin Console

| Route | Status | Purpose |
| --- | --- | --- |
| `/admin` | Implemented | Protected dashboard, question selection, invite email, timer, room-code generation, recent rounds |
| `/admin/questions` | Implemented | Searchable question bank with add/edit modal and delete guard for linked questions |
| `/admin/history` | Implemented | Fixed-height round list, refresh, session detail, collapsible report/code/questions/transcript/telemetry sections |
| `/admin/observe/{sessionId}` | Implemented | Read-only candidate-style observer screen with live code stream and polling refresh |
| `/admin/config` | Implemented | AI URL, model, system prompt, report prompt, and brute-force setting |

Admin authentication uses `/api/auth/login` and a signed bearer token stored by the frontend admin auth helper. Protected backend routes depend on `require_admin`.

## Candidate Flow

1. Admin creates a room from `/admin`.
2. Room creation requires an invite email and at least one selected question.
3. The backend creates a room plus an inactive session so the generated room appears in history immediately.
4. Candidate opens `/join`, enters name, email, and the six-character room code.
5. The room activates only when the email matches the invite.
6. A candidate session token is issued and saved in browser storage.
7. Candidate is redirected to `/interview/{sessionId}`.
8. The interview page shows a three-column workspace:
   - left: question list, markdown prompt, sample input/output
   - center: Monaco editor
   - right: AI chat transcript and input
9. Candidate or admin can end an active session.
10. Session end or timer expiry marks the session closed and generates/updates the interview report.

Room/session states used by the app:

| State | Meaning |
| --- | --- |
| `inactive` | Room generated, candidate has not started |
| `active` | Candidate joined and the timer is running |
| `completed` | Candidate or admin ended the session |
| `expired` | Timer elapsed and the session was closed |

Completed or expired room codes are rejected as invalid if the candidate tries to join again. Active sessions reject a second candidate join with an ongoing-session message.

## Candidate Access Controls

Candidate API calls require:

- `X-Session-Token`, issued by `/api/rooms/join`
- `X-Client-Id`, generated by the frontend per browser client

`backend/app/services/candidate_access.py` enforces a 30-second active client lease. If another tab/browser uses the same active candidate session while the lease is valid, the backend returns a conflict. The frontend also uses `BroadcastChannel` to block duplicate tabs earlier in the browser.

Admin observer sessions do not consume the candidate session and are unlimited.

## Code Sync and Live Observation

The candidate editor keeps code per question in `session_question_codes`.

| Mechanic | Implementation |
| --- | --- |
| Live code updates | `/api/session/{session_id}/live-code`, debounced at 500 ms in the frontend |
| Durable autosave | `/api/session/{session_id}/sync-code`, debounced at 15 seconds and flushed on unmount/end |
| Observer stream | `/api/admin/sessions/{session_id}/live-code`, server-sent events |
| Diff generation | `difflib.unified_diff` from starter code to final code per question |

The admin history detail displays final code and template diff per question. The observer page uses a read-only Monaco editor and receives live updates through the in-process `LiveCodeHub`.

Operational note: `LiveCodeHub` is process-local. It works for a single backend process. Multi-process or multi-instance deployment would need Redis, Postgres pub/sub, or another shared broker for live observer updates.

## AI Behavior

The backend uses `openai.AsyncOpenAI` with a configurable `base_url`, so it can call any OpenAI-compatible provider. Configure it with `LLM_PROVIDER_KEY`, `LLM_PROVIDER_URL`, and `LLM_PROVIDER_MODEL`.

Default chat prompt in `backend/app/services/llm.py`:

```text
You are a restricted coding assistant. Your primary task is to write code for the candidate, but ONLY under strict conditions.

CONSTRAINTS & RULES:
1. You are forbidden from designing algorithms or solving questions on your own.
2. You can only output code when the candidate explicitly specifies the exact algorithm, approach, or pseudocode, and provides a logical justification for why they want to use that approach.
3. If the candidate asks you to code a solution without specifying the approach and explaining the 'why', you must refuse and explain that they must first explain their algorithm choice and reasoning.
4. When writing code, write ONLY the implementation of the specific algorithm requested. Do not suggest optimizations or alternative solutions.
5. Generated code must not contain comments unless the candidate explicitly asks for comments.
6. When explaining a question, explain only the objective, inputs, outputs, constraints, and examples. Do not name or imply the algorithmic strategy, data structures, complexity target, pointer technique, recurrence, traversal order, or implementation plan.
7. Do not provide "high-level approach suggestions." Instead, ask the candidate what approach and data structures they would use.
8. If the candidate repeats an approach you previously suggested, do not treat it as independently identified. Ask them to justify it in their own words.
9. Keep conversational responses under 3 sentences. Be professional, direct, and act strictly as an instruction-following coding engine for the user's design.
```

When `force_brute_force` is enabled in `/admin/config`, the backend appends an additional directive instructing the assistant to generate only unoptimized brute-force implementations.

Report generation uses the configured report prompt and asks the model for JSON with `summary`, `code_evaluation`, and `recommendation`. If the LLM call fails or returns unusable output, the backend creates a deterministic fallback report from saved code, chat count, and telemetry flags.

## Telemetry

Telemetry is stored in `telemetry_events` and shown in `/admin/history`.

Events currently recorded:

- `session_started`
- `code_synced`
- `typing_speed_sample`
- `tab_visibility_changed`
- `copy_attempt_blocked`
- `cut_attempt_blocked`
- `paste_attempt_blocked`
- `copy_shortcut_blocked`
- `cut_shortcut_blocked`
- `paste_shortcut_blocked`
- `chat_user_message`
- `chat_assistant_message`
- `ai_provider_error`
- `session_ended`
- `session_ended_by_admin`
- `session_expired`

Suspicious flags are derived from hidden-tab visibility changes and blocked clipboard actions.

## Clipboard Restrictions

The candidate workspace blocks copy, cut, and paste events in:

- the question/prompt section
- the Monaco editor container
- Monaco keyboard shortcuts for copy, cut, and paste

Blocked attempts are sent to telemetry while the session is active.

## API Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | none | Backend health check |
| `POST` | `/api/auth/login` | none | Admin login |
| `POST` | `/api/auth/refresh` | admin | Refresh admin bearer token |
| `GET` | `/api/questions` | admin | List question bank |
| `POST` | `/api/questions` | admin | Create question |
| `PUT` | `/api/questions/{question_id}` | admin | Update question |
| `DELETE` | `/api/questions/{question_id}` | admin | Delete unused question |
| `GET` | `/api/admin/config` | admin | Read LLM configuration |
| `PUT` | `/api/admin/config` | admin | Update LLM configuration |
| `POST` | `/api/admin/config/models` | admin | List available LLM provider models |
| `GET` | `/api/admin/sessions` | admin | List inactive, active, completed, and expired rounds |
| `GET` | `/api/admin/sessions/{session_id}` | admin | Fetch round detail, transcript, telemetry, report, code snapshots |
| `GET` | `/api/admin/sessions/{session_id}/live-code` | admin | SSE stream of live code updates |
| `POST` | `/api/admin/sessions/{session_id}/close` | admin | End active session or regenerate report for closed session |
| `POST` | `/api/rooms/create` | admin | Create invite-gated room and inactive history session |
| `POST` | `/api/rooms/join` | none | Candidate joins with room code, name, and invite email |
| `GET` | `/api/session/{session_id}` | candidate | Fetch candidate session state |
| `POST` | `/api/session/{session_id}/sync-code` | candidate | Durable debounced code sync |
| `POST` | `/api/session/{session_id}/live-code` | candidate | Fast live-code update for observer mode |
| `POST` | `/api/session/{session_id}/chat` | candidate | SSE AI chat response |
| `POST` | `/api/session/{session_id}/telemetry` | candidate | Record telemetry event |
| `POST` | `/api/session/{session_id}/heartbeat` | candidate | Renew active client lease |
| `POST` | `/api/session/{session_id}/end` | candidate | End session and generate report |

## Maintenance Scripts

Create a portable SQL dump of the current Docker PostgreSQL database:

```bash
scripts/dump-db.sh
```

Default output:

```text
db_dumps/interview_platform_current.sql
```

Restore that dump on another developer machine:

```bash
docker compose up -d postgres
scripts/restore-db.sh --yes db_dumps/interview_platform_current.sql
```

The dump and restore scripts use host `pg_dump` / `psql` against `localhost:5432`, matching the default `DATABASE_URL` used by the backend. The restore script starts the Docker PostgreSQL service unless `SKIP_DOCKER=1` is set, waits for Postgres to become ready, then loads the dump into the `interview_platform` database. The dump includes schema and data and is generated with `--clean --if-exists`, so restoring it replaces matching local tables.

If a developer needs non-default Docker/Postgres names, override them with environment variables:

```bash
PGHOST=localhost PGPORT=5432 POSTGRES_USER=interview POSTGRES_PASSWORD=interview POSTGRES_DB=interview_platform scripts/restore-db.sh --yes db_dumps/interview_platform_current.sql
```

Clear room/session history while preserving the question bank, organizations, and LLM configuration:

```bash
cd backend
python scripts/clear_round_history.py
```

The script is a dry run by default and prints row counts for:

- `telemetry_events`
- `interview_reports`
- `chat_messages`
- `session_question_codes`
- `sessions`
- `room_questions`
- `rooms`

Apply the deletion:

```bash
python scripts/clear_round_history.py --yes
```

The script refuses to clear history when active sessions exist. Override that guard only for local reset work:

```bash
python scripts/clear_round_history.py --yes --force-active
```

## Verification Commands

Backend syntax check:

```bash
cd backend
python -m compileall app scripts
```

Frontend production build:

```bash
cd frontend
npm run build
```

Dependency audit:

```bash
cd frontend
npm audit
```

PostgreSQL container status:

```bash
docker compose ps
```

## Known Technical Friction

- No Alembic migration setup; schema changes currently live in `init_db()`.
- Live observer fan-out is process-local and not ready for horizontally scaled backend instances.
- No email delivery service is implemented. The room stores `invite_email` and enforces it at join time, but it does not send mail.
- There is no code execution sandbox. Reports evaluate saved code and transcript, not test results.
- Token counters remain in backend models/schemas and report rubric, although token-limit enforcement is currently commented out in chat handling.
