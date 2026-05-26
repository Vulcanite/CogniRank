# Agent Prompt Blueprint: AI-Native Developer Evaluation Platform

## Objective

Build a minimum viable product (MVP) for an AI-native developer interview platform. The application allows organizations (admins) to create interview "Rooms" with specific questions and token limits. Entry-level candidates join via a room code and write code alongside a highly restricted, stubborn "Rubber Duck" AI assistant that evaluates their logic before helping them write syntax. The evaluation is text-only (no sandbox execution needed).

## Core Tech Stack

* **Frontend:** Next.js (App Router), TypeScript, shadcn/ui components, Tailwind CSS.
* **Code Editor:** @monaco-editor/react.
* **Backend:** FastAPI (Python 3.11+), Async programming, WebSockets or Server-Sent Events (SSE).
* **Database:** PostgreSQL (using SQLModel or SQLAlchemy with asyncpg).
* **AI Integration:** OpenRouter or Nvidia Build API (Streaming enabled).

---

## Phase 1: Database Schema & Setup

Initialize a local PostgreSQL database and generate the models. Ensure foreign key relations cascade correctly.

```text
Create the following tables using your ORM:

1. Organizations
   - id (UUID, PK)
   - name (String)

2. Rooms
   - id (UUID, PK)
   - org_id (FK -> Organizations)
   - room_code (String, Unique, 6 characters, e.g., "XJ799B")
   - title (String)
   - problem_statement (Text)
   - sample_input_output (Text)
   - max_tokens (Integer)
   - created_at (Timestamp)

3. Sessions (Created when a candidate enters a code)
   - id (UUID, PK)
   - room_id (FK -> Rooms)
   - candidate_email (String)
   - candidate_name (String)
   - current_code (Text, Default: "")
   - tokens_used (Integer, Default: 0)
   - token_limit_hit (Boolean, Default: false)
   - updated_at (Timestamp)

4. ChatMessages
   - id (UUID, PK)
   - session_id (FK -> Sessions)
   - role (String: "user" or "assistant")
   - message (Text)
   - timestamp (Timestamp)

```

---

## Phase 2: FastAPI Backend & AI Orchestration

Set up the FastAPI core, focusing heavily on streaming tokens and tracking budgets.

### Tasks for the Agent:

1. Create a /api/rooms/create endpoint for admins to seed a question and set a token ceiling.
2. Create a /api/rooms/join endpoint that accepts a 6-digit code, verifies it, creates a Session, and returns a session ID.
3. Create a /api/session/{id}/sync-code endpoint. The frontend will debounce and send the current code editor contents here every 15 seconds to overwrite current_code.
4. Create a streaming chat endpoint /api/session/{id}/chat using EventSourceResponse (Server-Sent Events).

### AI Guardrail Engine Requirements:

Before hitting OpenRouter/Nvidia Build, the backend must fetch the Session data. Inject this hidden **System Prompt** at the top of the conversation array:

```text
You are an unyielding foundational gatekeeper assessing an entry-level programmer.
CRITICAL DIRECTIVE: You do not know the solution. You are forbidden from writing functional loops, conditionals, or working algorithms until the candidate has explicitly named a valid data structure or algorithmic approach and given a basic logical justification.

- If the candidate asks you to code it right away, refuse politely and remind them to state their high-level strategy and 'why' it works.
- If their approach is completely wrong (e.g., using Binary Search on an unsorted list), point out the real-world consequence of their error and ask them to reconsider. Do not give them the right answer.
- Keep your remarks under 3 sentences. Be a helpful but stubborn peer.

```

5. **Token Tracker Logic:** Parse the response chunk or final metadata object from the AI. Read the token usage, update tokens_used in the database, and if tokens_used >= max_tokens, toggle token_limit_hit = true and cut off future prompts.

---

## Phase 3: Next.js Frontend App Layout

Create a clean, distraction-free environment.

### Tasks for the Agent:

1. **Admin Workspace:** Simple form to insert a question name, description, sample inputs/outputs, token limit, and click "Generate Room Code."
2. **Candidate Entry Screen:** A central card layout asking for Candidate Name, Email, and Room Code.
3. **The 3-Column Interview Dashboard:**
* **Column 1 (Width: 25%):** Renders problem statement, constraints, and sample inputs using clean Markdown (prose class from Tailwind).
* **Column 2 (Width: 50%):** Renders the Monaco Editor. Bind the onChange handler to a 15-second debounced function hitting the /sync-code endpoint.
* **Column 3 (Width: 25%):** A dedicated chat interface using shadcn scroll-areas. Show a persistent badge at the top highlighting remaining tokens/budget (e.g., Tokens Used: 450 / 2000).



---

## Phase 4: Behavioral Persistence & Edge Cases

Make sure the platform behaves gracefully during candidate errors.

* **Reconnection Handling:** On page mount in the interview route, fetch the existing current_code and ChatMessages from the backend database. Pop them straight back into the UI state so a browser refresh loses zero work.
* **Token Hard-Stop UI:** If the backend flags token_limit_hit, disable the chat input text area entirely and display a banner: *"AI quota exhausted. Please complete the rest of the question on your own using the code editor."*

---

> **Instructions for your Coding Agent:**
> "Start by setting up the directory structure. Build the FastAPI database configuration and models first. Once the models are confirmed, generate the FastAPI routing layers before moving to the Next.js frontend components."