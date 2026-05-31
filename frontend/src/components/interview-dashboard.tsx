"use client";

import Editor from "@monaco-editor/react";
import { AlertCircle, Bot, CircleStop, Clock3, Code2, FileInput, ListChecks, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  ChatMessage,
  Question,
  endSession,
  getSessionState,
  heartbeatSession,
  recordTelemetry,
  sendLiveCode,
  streamChat,
  syncCode,
} from "@/lib/api";
import { readCandidateSessionAccess } from "@/lib/candidate-session";
import type { CandidateSessionAccess } from "@/lib/candidate-session";
import { debounce } from "@/lib/utils";

type InterviewDashboardProps = {
  sessionId: string;
};

function createPageInstanceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extractCodeBlocks(message: string) {
  const blocks: Array<{ language: string; code: string }> = [];
  const regex = /```([\w+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message)) !== null) {
    blocks.push({
      language: match[1] || "text",
      code: match[2].trimEnd(),
    });
  }
  return blocks;
}

function stripCodeBlocks(message: string) {
  return message
    .replace(/<tool_call>[\s\S]*?<\/assistant>/g, "")
    .replace(/<tool_call>[\s\S]*?$/g, "")
    .replace(/```[\w+-]*\n[\s\S]*?```/g, "")
    .replace(/<\/?(tool_call|assistant)>/g, "")
    .trim();
}

export default function InterviewDashboard({ sessionId }: InterviewDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<CandidateSessionAccess>({ token: null, clientId: "" });
  const [tabClaimed, setTabClaimed] = useState(false);
  const [duplicateTabOpen, setDuplicateTabOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [sampleIO, setSampleIO] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [codeByQuestion, setCodeByQuestion] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("active");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "warning" | "error";
  } | null>(null);
  const [notifiedTenMin, setNotifiedTenMin] = useState(false);
  const [notifiedFiveMin, setNotifiedFiveMin] = useState(false);
  const [notifiedOneMin, setNotifiedOneMin] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const typingSampleRef = useRef({ startedAt: 0, chars: 0, lastLength: 0 });
  const activeQuestionIdRef = useRef<string | null>(null);
  const pageInstanceIdRef = useRef(createPageInstanceId());
  const lastRecordedTelemetryRef = useRef<Record<string, number>>({});

  const recordTelemetryThrottled = useCallback(
    (eventType: string, metadata: Record<string, unknown>, limitMs = 2000) => {
      const now = Date.now();
      const lastTime = lastRecordedTelemetryRef.current[eventType] || 0;
      if (now - lastTime < limitMs) {
        return;
      }
      lastRecordedTelemetryRef.current[eventType] = now;
      recordTelemetry(sessionId, eventType, metadata, access).catch(() => undefined);
    },
    [sessionId, access]
  );

  const debouncedSync = useMemo(
    () =>
      debounce((questionId: string | null, nextCode: string) => {
        syncCode(sessionId, nextCode, questionId, access).catch(() => undefined);
      }, 15000),
    [access, sessionId]
  );

  const debouncedLiveSync = useMemo(
    () =>
      debounce((questionId: string, nextCode: string) => {
        sendLiveCode(sessionId, nextCode, questionId, access).catch(() => undefined);
      }, 500),
    [access, sessionId]
  );

  const loadSession = useCallback(async () => {
    if (!access.clientId || !tabClaimed || duplicateTabOpen) return;
    try {
      const state = await getSessionState(sessionId, access);
      setRoomTitle(state.room_title);
      setProblemStatement(state.problem_statement);
      setSampleIO(state.sample_input_output);
      setQuestions(state.questions);
      setCodeByQuestion(
        Object.fromEntries(
          state.questions.map((question) => [
            question.id,
            state.code_by_question[question.id] ?? question.starter_code,
          ])
        )
      );
      setActiveQuestionId((current) =>
        state.questions.some((question) => question.id === current)
          ? current
          : state.questions[0]?.id ?? null
      );
      setMessages(state.messages);
      setStatus(state.status);
      setExpiresAt(state.expires_at);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [access, duplicateTabOpen, sessionId, tabClaimed]);

  useEffect(() => {
    setAccess(readCandidateSessionAccess(sessionId));
    setTabClaimed(false);
    setDuplicateTabOpen(false);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const activeQuestion = questions.find((question) => question.id === activeQuestionId) ?? questions[0];
  const sessionComplete = status !== "active";
  const activeCode = activeQuestion ? codeByQuestion[activeQuestion.id] ?? activeQuestion.starter_code : "";
  const activeQuestionIndex = activeQuestion
    ? questions.findIndex((question) => question.id === activeQuestion.id)
    : -1;

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => msg.question_id === activeQuestionId);
  }, [messages, activeQuestionId]);

  useEffect(() => {
    return () => {
      debouncedLiveSync.flush();
      debouncedSync.flush();
    };
  }, [activeQuestion?.id, debouncedLiveSync, debouncedSync]);

  useEffect(() => {
    activeQuestionIdRef.current = activeQuestion?.id ?? null;
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (!expiresAt || sessionComplete) {
      setRemainingSeconds(null);
      return;
    }
    const expiry = expiresAt;

    function updateRemaining() {
      const seconds = Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) void loadSession();
    }

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, loadSession, sessionComplete]);

  useEffect(() => {
    if (remainingSeconds === null) return;
    if (remainingSeconds <= 600 && remainingSeconds > 590 && !notifiedTenMin) {
      setNotifiedTenMin(true);
      setNotification({
        message: "10 minutes remaining in this session.",
        type: "info",
      });
    } else if (remainingSeconds <= 300 && remainingSeconds > 290 && !notifiedFiveMin) {
      setNotifiedFiveMin(true);
      setNotification({
        message: "5 minutes remaining. Wrap up your changes and prepare to submit.",
        type: "warning",
      });
    } else if (remainingSeconds <= 60 && remainingSeconds > 0 && !notifiedOneMin) {
      setNotifiedOneMin(true);
      setNotification({
        message: "Only 1 minute remaining! Your work will be submitted automatically.",
        type: "error",
      });
    }
  }, [remainingSeconds, notifiedTenMin, notifiedFiveMin, notifiedOneMin]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    if (!access.clientId || sessionComplete) {
      if (sessionComplete) setTabClaimed(true);
      return;
    }

    if (!access.token) {
      setTabClaimed(true);
      return;
    }

    if (typeof BroadcastChannel === "undefined") {
      setTabClaimed(true);
      return;
    }

    let blocked = false;
    let ownsTab = false;
    const pageInstanceId = pageInstanceIdRef.current;
    const channel = new BroadcastChannel(`interview-session:${sessionId}`);
    const claimTimer = window.setTimeout(() => {
      if (!blocked) {
        ownsTab = true;
        setTabClaimed(true);
      }
    }, 300);

    channel.onmessage = (event) => {
      const data = event.data as { type?: string; pageInstanceId?: string } | null;
      if (!data || data.pageInstanceId === pageInstanceId) return;

      if (data.type === "claim") {
        if (ownsTab) channel.postMessage({ type: "active", pageInstanceId });
        return;
      }

      if (data.type === "active") {
        blocked = true;
        window.clearTimeout(claimTimer);
        setDuplicateTabOpen(true);
        setTabClaimed(false);
        setError("This interview session is already open in another tab or browser.");
        setLoading(false);
        channel.close();
      }
    };

    channel.postMessage({ type: "claim", pageInstanceId });

    return () => {
      window.clearTimeout(claimTimer);
      channel.close();
    };
  }, [access.clientId, access.token, sessionComplete, sessionId]);

  useEffect(() => {
    function handleVisibilityChange() {
      recordTelemetryThrottled("tab_visibility_changed", {
        visibility_state: document.visibilityState,
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [recordTelemetryThrottled]);

  useEffect(() => {
    if (!access.clientId || sessionComplete) return;

    const timer = window.setInterval(() => {
      heartbeatSession(sessionId, access).catch((err) => {
        setError(err instanceof Error ? err.message : "Interview session is not available");
        void loadSession();
      });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [access, loadSession, sessionComplete, sessionId]);

  function blockClipboard(event: React.ClipboardEvent, area: "editor" | "question") {
    event.preventDefault();
    recordTelemetryThrottled(`${event.type}_attempt_blocked`, {
      area,
      question_id: activeQuestionIdRef.current,
    });
  }

  function recordTypingSample(nextCode: string) {
    const now = Date.now();
    const sample = typingSampleRef.current;
    if (!sample.startedAt) {
      typingSampleRef.current = { startedAt: now, chars: 0, lastLength: nextCode.length };
      return;
    }

    sample.chars += Math.abs(nextCode.length - sample.lastLength);
    sample.lastLength = nextCode.length;
    const elapsedMs = now - sample.startedAt;
    if (elapsedMs >= 10000 && sample.chars > 0) {
      recordTelemetry(
        sessionId,
        "typing_speed_sample",
        {
          question_id: activeQuestionIdRef.current,
          chars_typed: sample.chars,
          elapsed_ms: elapsedMs,
          chars_per_minute: Math.round((sample.chars / elapsedMs) * 60000),
        },
        access
      ).catch(() => undefined);
      typingSampleRef.current = { startedAt: now, chars: 0, lastLength: nextCode.length };
    }
  }

  function handleCodeChange(value: string | undefined) {
    const nextCode = value ?? "";
    if (!activeQuestion) return;
    setCodeByQuestion((current) => ({ ...current, [activeQuestion.id]: nextCode }));
    recordTypingSample(nextCode);
    debouncedLiveSync(activeQuestion.id, nextCode);
    debouncedSync(activeQuestion.id, nextCode);
  }

  async function applyAssistantCode(nextCode: string) {
    if (!activeQuestion || sessionComplete) return;
    setCodeByQuestion((current) => ({ ...current, [activeQuestion.id]: nextCode }));
    debouncedLiveSync(activeQuestion.id, nextCode);
    try {
      await syncCode(sessionId, nextCode, activeQuestion.id, access);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply code");
    }
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim() || streaming || sessionComplete) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setStreaming(true);
    setStreamingText("");

    const optimisticUser: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      message: userMessage,
      timestamp: new Date().toISOString(),
      question_id: activeQuestionId ?? undefined,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    let assistantReply = "";

    try {
      await streamChat(
        sessionId,
        userMessage,
        activeQuestionId,
        (content) => {
          assistantReply += content;
          setStreamingText(assistantReply);
        },
        () => undefined,
        (detail) => setError(detail),
        access
      );

      const finalReply =
        assistantReply || "I'm here to help you think through your approach. What's your high-level strategy?";

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((msg) => msg.id !== optimisticUser.id);
        return [
          ...withoutOptimistic,
          optimisticUser,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            message: finalReply,
            timestamp: new Date().toISOString(),
            question_id: activeQuestionId ?? undefined,
          },
        ];
      });
      setStreamingText("");
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setStreaming(false);
    }
  }

  async function handleEndSession() {
    if (ending || sessionComplete) return;
    setEnding(true);
    setError(null);
    try {
      debouncedLiveSync.flush();
      debouncedSync.flush();
      if (activeQuestion) {
        await syncCode(sessionId, activeCode, activeQuestion.id, access);
      }
      const result = await endSession(sessionId, access);
      setEndConfirmOpen(false);
      window.sessionStorage.setItem(`ended-session:${sessionId}`, "true");
      setStatus(result.status);
      await loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-grid flex min-h-screen items-center justify-center bg-background p-6">
        <p className="surface-panel rounded-sm p-5 text-sm text-muted-foreground">Loading interview session...</p>
      </main>
    );
  }

  if (error && !roomTitle) {
    return (
      <main className="dashboard-grid flex min-h-screen items-center justify-center bg-background p-6">
        <p className="surface-panel rounded-sm p-5 text-sm text-destructive">{error}</p>
      </main>
    );
  }

  if (sessionComplete) {
    const expired = status === "expired";
    const endedInThisTab =
      typeof window !== "undefined" && window.sessionStorage.getItem(`ended-session:${sessionId}`) === "true";
    return (
      <main className="dashboard-grid flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="surface-panel page-enter relative z-[1] max-w-xl rounded-sm p-8 text-center">
          <CircleStop className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-5 text-3xl font-semibold">
            {expired
              ? "This interview link has expired."
              : endedInThisTab
                ? "This interview session has ended."
                : "This interview link is invalid."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Thank you for participating in the interview. We will review your work and get back to you soon.
          </p>
          {roomTitle && <p className="mt-6 rounded-sm border bg-background/70 p-3 text-sm">{roomTitle}</p>}
        </section>
      </main>
    );
  }

  const remainingLabel =
    remainingSeconds === null
      ? "Timer unavailable"
      : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b bg-card/84 px-5 py-3 shadow-sm backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Candidate workspace</p>
          <h1 className="text-lg font-semibold">{roomTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge
            variant={remainingSeconds !== null && remainingSeconds < 300 ? "destructive" : "outline"}
            className={remainingSeconds !== null && remainingSeconds < 300 ? "timer-critical" : ""}
          >
            <Clock3 className="mr-1 h-3.5 w-3.5" />
            {remainingLabel}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEndConfirmOpen(true)}
            disabled={ending || sessionComplete}
          >
            <CircleStop className="h-4 w-4" />
            {sessionComplete ? "Ended" : ending ? "Ending..." : "End Session"}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {sessionComplete && (
        <div className="border-b bg-destructive/10 px-6 py-3 text-sm text-destructive">
          Session ended. The admin can now review the final code, transcript, and report.
        </div>
      )}

      <div className="page-enter grid min-h-0 flex-1 grid-cols-12 bg-background">
        <aside
          className="col-span-3 flex min-h-0 flex-col border-r bg-card/42"
          onCopy={(event) => blockClipboard(event, "question")}
          onCut={(event) => blockClipboard(event, "question")}
          onPaste={(event) => blockClipboard(event, "question")}
        >
          <div className="border-b bg-card/58 p-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Questions</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {questions.length > 1
                ? `${Math.max(activeQuestionIndex + 1, 1)} of ${questions.length} selected`
                : "Single question round"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {questions.length > 1 && (
              <div className="mb-5 grid gap-2">
                {questions.map((question, index) => (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveQuestionId(question.id)}
                    className={`interactive-lift w-full rounded-sm border p-3 text-left text-sm ${
                      activeQuestion?.id === question.id
                        ? "border-primary/45 bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                        : "bg-background/76 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-8 w-1 shrink-0 rounded-full ${
                          activeQuestion?.id === question.id ? "bg-primary" : "bg-border"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="text-xs opacity-75">Question {index + 1}</span>
                        <span className="mt-1 block font-medium">{question.title}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-sm border bg-background/72 p-4">
              <p className="font-mono text-xs text-muted-foreground">
                QUESTION {Math.max(activeQuestionIndex + 1, 1)}
              </p>
              <div className="prose prose-sm mt-3 max-w-none dark:prose-invert prose-pre:bg-card prose-pre:text-card-foreground">
                <h2>{activeQuestion?.title ?? "Problem"}</h2>
                <ReactMarkdown>{activeQuestion?.prompt ?? problemStatement}</ReactMarkdown>
              </div>
            </div>

            <div className="mt-4 rounded-sm border bg-background/72 p-4">
              <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Sample Input / Output</p>
              <SampleIO value={activeQuestion?.sample_input_output ?? sampleIO} />
            </div>
          </div>
        </aside>

        <section
          ref={editorContainerRef}
          className="col-span-6 flex min-h-0 flex-col border-r bg-[#1e1e1e]"
          onCopy={(event) => blockClipboard(event, "editor")}
          onCut={(event) => blockClipboard(event, "editor")}
          onPaste={(event) => blockClipboard(event, "editor")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#181818] px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <p className="truncate text-sm font-semibold">{activeQuestion?.title ?? "Editor"}</p>
              </div>
            </div>
            <Badge variant="outline" className="border-white/15 text-white">
              Q{Math.max(activeQuestionIndex + 1, 1)}
            </Badge>
          </div>
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              value={activeCode}
              onChange={handleCodeChange}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                  recordTelemetryThrottled("paste_shortcut_blocked", {
                    area: "editor",
                    question_id: activeQuestionIdRef.current,
                  });
                });
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
                  recordTelemetryThrottled("copy_shortcut_blocked", {
                    area: "editor",
                    question_id: activeQuestionIdRef.current,
                  });
                });
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
                  recordTelemetryThrottled("cut_shortcut_blocked", {
                    area: "editor",
                    question_id: activeQuestionIdRef.current,
                  });
                });
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </section>

        <aside className="col-span-3 flex min-h-0 flex-col bg-card/38">
          <div className="border-b bg-card/58 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Question Chat</p>
              </div>
              <Badge variant="secondary">{filteredMessages.length}</Badge>
            </div>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="list-enter space-y-4">
              {filteredMessages.length === 0 && !streamingText && (
                <div className="rounded-sm border border-dashed bg-background/54 p-4 text-sm text-muted-foreground">
                  Ask about the active problem, your approach, edge cases, or the current code.
                </div>
              )}
              {filteredMessages.map((msg) => (
                <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[88%] rounded-sm p-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/15"
                        : "border bg-background/76"
                    }`}
                  >
                  {msg.role === "assistant" ? (
                    <AssistantMessage message={msg.message} onApplyCode={applyAssistantCode} disabled={sessionComplete} />
                  ) : (
                    msg.message
                  )}
                  </div>
                </div>
              ))}
              {streamingText && (
                <div className="max-w-[88%] rounded-sm border bg-background/76 p-3 text-sm">
                  <AssistantMessage message={streamingText} onApplyCode={applyAssistantCode} disabled={sessionComplete} />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSendMessage} className="border-t bg-card/72 p-4">
            {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                sessionComplete
                  ? "Chat disabled — session ended"
                  : "Ask the Rubber Duck about your approach..."
              }
              disabled={streaming || sessionComplete}
              rows={2}
              className="mb-2 max-h-32 min-h-20"
            />
            <Button
              type="submit"
              disabled={streaming || sessionComplete || !chatInput.trim()}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
            >
              {streaming ? "Thinking..." : "Send"}
              {!streaming && <Send className="h-4 w-4" />}
            </Button>
          </form>
        </aside>
      </div>

      {endConfirmOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-end-session-title"
            className="surface-panel modal-panel w-full max-w-md rounded-sm p-5"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-destructive/10 text-destructive">
                <CircleStop className="h-5 w-5" />
              </div>
              <div>
                <h2 id="candidate-end-session-title" className="text-lg font-semibold">
                  End this interview session?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This will submit the current work and close the session.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEndConfirmOpen(false)} disabled={ending}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleEndSession}
                disabled={ending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <CircleStop className="h-4 w-4" />
                {ending ? "Ending..." : "End Session"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {notification && (
        <div className="surface-panel toast-panel fixed bottom-6 right-6 z-50 max-w-sm rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-5 w-5 shrink-0 ${
              notification.type === "error" ? "text-destructive" :
              notification.type === "warning" ? "text-amber-500" :
              "text-blue-500"
            }`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Time Warning</p>
              <p className="mt-1 text-xs text-muted-foreground">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseSampleIO(value: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const inputIndex = lower.indexOf("input:");
  const outputIndex = lower.indexOf("output:");

  if (inputIndex === -1 || outputIndex === -1 || outputIndex <= inputIndex) {
    return null;
  }

  return {
    input: trimmed.slice(inputIndex + "input:".length, outputIndex).trim().replace(/,$/, ""),
    output: trimmed.slice(outputIndex + "output:".length).trim(),
  };
}

function SampleIO({ value }: { value: string }) {
  const parsed = parseSampleIO(value);

  if (!parsed) {
    return (
      <div className="prose prose-sm mt-3 max-w-none dark:prose-invert prose-pre:bg-card prose-pre:text-card-foreground">
        <ReactMarkdown>{value}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="overflow-hidden rounded-sm border bg-card/80">
        <div className="border-b bg-muted/60 px-3 py-2 font-mono text-[11px] font-semibold uppercase text-muted-foreground">
          Input
        </div>
        <pre className="overflow-auto px-3 py-3 font-mono text-xs leading-5 text-foreground">
          <code>{parsed.input}</code>
        </pre>
      </div>
      <div className="overflow-hidden rounded-sm border bg-card/80">
        <div className="border-b bg-primary/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase text-primary">
          Expected Output
        </div>
        <pre className="overflow-auto px-3 py-3 font-mono text-xs leading-5 text-foreground">
          <code>{parsed.output}</code>
        </pre>
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  onApplyCode,
  disabled,
}: {
  message: string;
  onApplyCode: (code: string) => void;
  disabled: boolean;
}) {
  const blocks = extractCodeBlocks(message);
  const displayText = stripCodeBlocks(message);
  return (
    <div className="space-y-3">
      {displayText && (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-code:rounded-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown>{displayText}</ReactMarkdown>
        </div>
      )}
      {blocks.map((block, index) => (
        <div key={`${block.language}-${index}`} className="overflow-hidden rounded-sm border bg-background/70">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
            <span className="text-xs font-medium uppercase text-muted-foreground">{block.language}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onApplyCode(block.code)}
              className="h-8 shrink-0"
            >
              <FileInput className="h-4 w-4" />
              Apply to Editor
            </Button>
          </div>
          <pre className="max-h-52 overflow-auto p-3 text-xs">
            <code>{block.code}</code>
          </pre>
        </div>
      ))}
    </div>
  );
}
