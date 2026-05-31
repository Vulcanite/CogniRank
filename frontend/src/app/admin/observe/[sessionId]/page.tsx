"use client";

import Editor from "@monaco-editor/react";
import { Eye, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { AdminLogin } from "@/components/admin-login";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AdminLiveCodeSnapshot,
  AdminLiveCodeUpdate,
  AdminSessionDetail,
  getAdminSession,
  streamAdminLiveCode,
} from "@/lib/api";
import { useAdminAuth } from "@/lib/use-admin-auth";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default function ObservePage({ params }: PageProps) {
  const { sessionId } = use(params);
  const { token, ready, acceptLogin } = useAdminAuth();
  const [session, setSession] = useState<AdminSessionDetail | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [liveCodeByQuestion, setLiveCodeByQuestion] = useState<Record<string, string>>({});
  const [liveStatus, setLiveStatus] = useState("Connecting");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminSession(sessionId, token);
      setSession(result);
      setLiveCodeByQuestion(
        Object.fromEntries(
          result.code_snapshots.map((snapshot) => [snapshot.question_id, snapshot.final_code])
        )
      );
      setActiveQuestionId((current) =>
        result.questions.some((question) => question.id === current)
          ? current
          : result.questions[0]?.id ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load observer view");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load();
  }, [token, sessionId]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [token, sessionId]);

  useEffect(() => {
    if (!token) return;
    const adminToken = token;
    const controller = new AbortController();
    let cancelled = false;

    async function connect() {
      while (!cancelled) {
        try {
          setLiveStatus("Connecting");
          setError(null);
          await streamAdminLiveCode(
            sessionId,
            adminToken,
            (event, data) => {
              setLiveStatus("Live");
              setError(null);
              if (event === "code_snapshot") {
                const snapshot = data as AdminLiveCodeSnapshot;
                setLiveCodeByQuestion(snapshot.code_by_question);
                setSession((current) =>
                  current
                    ? {
                        ...current,
                        status: snapshot.status,
                        updated_at: snapshot.updated_at,
                      }
                    : current
                );
              }
              if (event === "code_update") {
                const update = data as AdminLiveCodeUpdate;
                if (!update.question_id) return;
                setLiveCodeByQuestion((current) => ({
                  ...current,
                  [update.question_id as string]: update.current_code,
                }));
                setSession((current) =>
                  current
                    ? {
                        ...current,
                        status: update.status,
                        updated_at: update.updated_at,
                        code_snapshots: current.code_snapshots.map((snapshot) =>
                          snapshot.question_id === update.question_id
                            ? { ...snapshot, final_code: update.current_code, updated_at: update.updated_at }
                            : snapshot
                        ),
                      }
                    : current
                );
              }
            },
            controller.signal
          );
        } catch (err) {
          if (controller.signal.aborted || cancelled) break;
          setLiveStatus("Reconnecting");
          setError(err instanceof Error ? err.message : "Live code stream disconnected");
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      }
    }

    void connect();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, sessionId]);

  const activeQuestion = useMemo(
    () => session?.questions.find((question) => question.id === activeQuestionId) ?? session?.questions[0],
    [activeQuestionId, session]
  );
  const activeSnapshot = useMemo(
    () => session?.code_snapshots.find((snapshot) => snapshot.question_id === activeQuestion?.id),
    [activeQuestion?.id, session]
  );
  const activeCode = activeQuestion ? liveCodeByQuestion[activeQuestion.id] ?? activeSnapshot?.final_code ?? "" : "";
  const remainingLabel = formatRemaining(session?.expires_at ?? null, session?.status ?? "active");

  if (!ready) return null;
  if (!token) return <AdminLogin onLogin={acceptLogin} />;

  if (!session) {
    return (
      <main className="dashboard-grid flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="surface-panel relative z-[1] rounded-sm p-6 text-sm text-muted-foreground">
          {error ?? "Loading observer view..."}
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b bg-card/84 px-5 py-3 shadow-sm backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Observer Mode</h1>
            <Badge variant={session.status === "active" ? "outline" : "secondary"}>{displayStatus(session.status)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {session.candidate_name} · {session.room_title} · read-only
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">Timer: {remainingLabel}</Badge>
          <Badge variant={liveStatus === "Live" ? "default" : "outline"}>{liveStatus}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/history">
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          </Button>
        </div>
      </header>

      {error && <div className="border-b bg-destructive/10 px-6 py-2 text-sm text-destructive">{error}</div>}

      <div className="page-enter grid min-h-0 flex-1 grid-cols-12 bg-background">
        <aside className="col-span-3 overflow-auto border-r bg-card/42 p-5">
          {session.questions.length > 1 && (
            <div className="mb-4 space-y-2">
              {session.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setActiveQuestionId(question.id)}
                  className={`w-full rounded-sm border p-3 text-left text-sm transition ${
                    activeQuestion?.id === question.id
                      ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-background/76 hover:border-primary/50"
                  }`}
                >
                  <span className="text-xs opacity-75">Question {index + 1}</span>
                  <span className="mt-1 block font-medium">{question.title}</span>
                </button>
              ))}
            </div>
          )}

          <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-card prose-pre:text-card-foreground">
            <h2>{activeQuestion?.title ?? "Problem"}</h2>
            <ReactMarkdown>{activeQuestion?.prompt ?? ""}</ReactMarkdown>
            <h3>Sample Input / Output</h3>
            <ReactMarkdown>{activeQuestion?.sample_input_output ?? ""}</ReactMarkdown>
          </div>
        </aside>

        <section className="col-span-6 min-h-0 border-r bg-[#1e1e1e]">
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={activeCode}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </section>

        <aside className="col-span-3 flex min-h-0 flex-col bg-card/38">
          <ScrollArea className="flex-1 p-4">
            <div className="list-enter space-y-4">
              {session.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-sm p-3 text-sm ${
                    msg.role === "user" ? "ml-6 bg-primary text-primary-foreground shadow-md shadow-primary/15" : "mr-6 border bg-background/76"
                  }`}
                >
                  {msg.message}
                </div>
              ))}
              {session.messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            </div>
          </ScrollArea>

          <div className="border-t bg-card/72 p-4">
            <div className="rounded-sm border bg-background/70 p-3 text-sm text-muted-foreground">
              Code updates stream live. Session details and chat refresh every 5 seconds. Editing and chat are disabled.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatRemaining(expiresAt: string | null, status: string) {
  if (status !== "active") return displayStatus(status);
  if (!expiresAt) return "Unavailable";
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function displayStatus(status: string) {
  if (status === "expired") return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
