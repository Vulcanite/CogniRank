import { expireAdminAuth } from "@/lib/admin-auth";
import type { CandidateSessionAccess } from "@/lib/candidate-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type RoomCreatePayload = {
  org_name?: string;
  title: string;
  max_tokens: number;
  duration_minutes: number;
  invite_email: string;
  question_ids: string[];
  problem_statement?: string;
  sample_input_output?: string;
};

export type Question = {
  id: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  prompt: string;
  sample_input_output: string;
  starter_code: string;
  tags: string[];
};

export type QuestionPayload = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  prompt: string;
  sample_input_output: string;
  starter_code: string;
  tags: string[];
};

export type RoomCreateResponse = {
  room_id: string;
  room_code: string;
  title: string;
  max_tokens: number;
  duration_minutes: number;
  invite_email: string | null;
  questions: Question[];
};

export type RoomJoinPayload = {
  room_code: string;
  candidate_name: string;
  candidate_email: string;
};

export type RoomJoinResponse = {
  session_id: string;
  session_token: string;
  room_title: string;
  problem_statement: string;
  sample_input_output: string;
  questions: Question[];
  max_tokens: number;
  tokens_used: number;
  token_limit_hit: boolean;
  status: string;
  expires_at: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  message: string;
  timestamp: string;
};

export type SessionState = {
  session_id: string;
  room_title: string;
  problem_statement: string;
  sample_input_output: string;
  questions: Question[];
  current_code: string;
  max_tokens: number;
  tokens_used: number;
  token_limit_hit: boolean;
  status: string;
  ended_at: string | null;
  expires_at: string | null;
  code_by_question: Record<string, string>;
  messages: ChatMessage[];
};

export type AdminLoginResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
  username: string;
};

export type AIConfiguration = {
  api_url: string;
  model: string;
  system_prompt: string;
  report_prompt: string;
  force_brute_force: boolean;
  updated_at: string;
};

export type AIConfigurationPayload = Omit<AIConfiguration, "updated_at">;

export type InterviewReport = {
  id: string;
  session_id: string;
  summary: string;
  recommendation: string;
  rubric: Record<string, unknown>;
  created_at: string;
};

export type AdminSessionSummary = {
  session_id: string;
  room_id: string;
  room_title: string;
  room_code: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  expires_at: string | null;
  updated_at: string;
  tokens_used: number;
  max_tokens: number;
  duration_minutes: number;
  invite_email: string | null;
  question_count: number;
  report_ready: boolean;
  suspicious_flags: string[];
};

export type CodeSnapshot = {
  question_id: string;
  question_title: string;
  starter_code: string;
  final_code: string;
  diff: string[];
  updated_at: string | null;
};

export type TelemetryEvent = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  timestamp: string;
};

export type AdminSessionDetail = AdminSessionSummary & {
  current_code: string;
  questions: Question[];
  code_snapshots: CodeSnapshot[];
  messages: ChatMessage[];
  telemetry: TelemetryEvent[];
  report: InterviewReport | null;
};

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    if (response.status === 401 && token) {
      expireAdminAuth();
    }
    throw new Error(error.detail ?? "Request failed");
  }

  return response.json();
}

function candidateHeaders(access?: CandidateSessionAccess | null) {
  return {
    ...(access?.token ? { "X-Session-Token": access.token } : {}),
    ...(access?.clientId ? { "X-Client-Id": access.clientId } : {}),
  };
}

export function loginAdmin(username: string, password: string) {
  return request<AdminLoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function refreshAdmin(token: string) {
  return request<AdminLoginResponse>("/api/auth/refresh", {
    method: "POST",
  }, token);
}

export function listQuestions(token: string) {
  return request<Question[]>("/api/questions", undefined, token);
}

export function createQuestion(payload: QuestionPayload, token: string) {
  return request<Question>("/api/questions", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export function updateQuestion(questionId: string, payload: Partial<QuestionPayload>, token: string) {
  return request<Question>(`/api/questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, token);
}

export function deleteQuestion(questionId: string, token: string) {
  return request<{ deleted: boolean }>(`/api/questions/${questionId}`, {
    method: "DELETE",
  }, token);
}

export function createRoom(payload: RoomCreatePayload, token: string) {
  return request<RoomCreateResponse>("/api/rooms/create", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export function joinRoom(payload: RoomJoinPayload) {
  return request<RoomJoinResponse>("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSessionState(sessionId: string, access?: CandidateSessionAccess | null) {
  return request<SessionState>(`/api/session/${sessionId}`, {
    headers: candidateHeaders(access),
  });
}

export function syncCode(
  sessionId: string,
  currentCode: string,
  questionId?: string | null,
  access?: CandidateSessionAccess | null
) {
  return request<{ updated_at: string }>(`/api/session/${sessionId}/sync-code`, {
    method: "POST",
    headers: candidateHeaders(access),
    body: JSON.stringify({ current_code: currentCode, question_id: questionId ?? null }),
  });
}

export function sendLiveCode(
  sessionId: string,
  currentCode: string,
  questionId: string,
  access?: CandidateSessionAccess | null
) {
  return request<{ updated_at: string }>(`/api/session/${sessionId}/live-code`, {
    method: "POST",
    headers: candidateHeaders(access),
    body: JSON.stringify({ current_code: currentCode, question_id: questionId }),
  });
}

export function endSession(sessionId: string, access?: CandidateSessionAccess | null) {
  return request<{ status: string; ended_at: string; report: InterviewReport }>(`/api/session/${sessionId}/end`, {
    method: "POST",
    headers: candidateHeaders(access),
  });
}

export function recordTelemetry(
  sessionId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  access?: CandidateSessionAccess | null
) {
  return request<{ recorded: boolean }>(`/api/session/${sessionId}/telemetry`, {
    method: "POST",
    headers: candidateHeaders(access),
    body: JSON.stringify({ event_type: eventType, metadata }),
  });
}

export function heartbeatSession(sessionId: string, access?: CandidateSessionAccess | null) {
  return request<{ status: string; lease_expires_at: string | null }>(`/api/session/${sessionId}/heartbeat`, {
    method: "POST",
    headers: candidateHeaders(access),
  });
}

export function listAdminSessions(token: string) {
  return request<AdminSessionSummary[]>("/api/admin/sessions", undefined, token);
}

export function getAdminSession(sessionId: string, token: string) {
  return request<AdminSessionDetail>(`/api/admin/sessions/${sessionId}`, undefined, token);
}

export type AdminLiveCodeSnapshot = {
  code_by_question: Record<string, string>;
  status: string;
  updated_at: string;
};

export type AdminLiveCodeUpdate = {
  question_id: string | null;
  current_code: string;
  updated_at: string;
  status: string;
};

export async function streamAdminLiveCode(
  sessionId: string,
  token: string,
  onEvent: (event: string, data: AdminLiveCodeSnapshot | AdminLiveCodeUpdate) => void,
  signal: AbortSignal
) {
  const response = await fetch(`${API_URL}/api/admin/sessions/${sessionId}/live-code`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail ?? "Live code stream failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No live code stream body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.replace(/\r\n/g, "\n").split("\n");
      let event = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }

      if (event === "ping" || dataLines.length === 0) continue;
      onEvent(event, JSON.parse(dataLines.join("\n")));
    }
  }
}

export function closeAdminSession(sessionId: string, token: string) {
  return request<AdminSessionDetail>(`/api/admin/sessions/${sessionId}/close`, {
    method: "POST",
  }, token);
}

export function getAIConfiguration(token: string) {
  return request<AIConfiguration>("/api/admin/config", undefined, token);
}

export function updateAIConfiguration(payload: AIConfigurationPayload, token: string) {
  return request<AIConfiguration>("/api/admin/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  }, token);
}

export async function streamChat(
  sessionId: string,
  message: string,
  onToken: (content: string) => void,
  onDone: (data: { tokens_used: number; max_tokens: number; token_limit_hit: boolean }) => void,
  onError: (detail: string) => void,
  access?: CandidateSessionAccess | null
) {
  const response = await fetch(`${API_URL}/api/session/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...candidateHeaders(access) },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail ?? "Chat request failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }

      if (!data) continue;

      const parsed = JSON.parse(data);
      if (event === "token") onToken(parsed.content);
      if (event === "done") onDone(parsed);
      if (event === "error") onError(parsed.detail);
    }
  }
}
