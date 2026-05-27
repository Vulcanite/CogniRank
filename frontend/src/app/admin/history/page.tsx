"use client";

import { Activity, CheckCircle2, CircleStop, Eye, FileText, GitCompare, History, MessageSquareText, RefreshCw, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { AdminLogin } from "@/components/admin-login";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSessionDetail, AdminSessionSummary, closeAdminSession, getAdminSession, listAdminSessions } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/use-admin-auth";
import ReactMarkdown from "react-markdown";

export default function HistoryPage() {
  const { token, user, ready, acceptLogin } = useAdminAuth();
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [selected, setSelected] = useState<AdminSessionDetail | null>(null);
  const [query, setQuery] = useState("");
  const [transcriptFilter, setTranscriptFilter] = useState<"all" | "user" | "assistant">("all");
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load(nextToken: string, preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminSessions(nextToken);
      setSessions(result);
      const targetId = preferredId ?? selected?.session_id ?? result[0]?.session_id;
      if (targetId) {
        setSelected(await getAdminSession(targetId, nextToken));
      } else {
        setSelected(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    void load(token, params.get("session"));
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) =>
      `${session.candidate_name} ${session.candidate_email} ${session.room_title} ${session.room_code}`.toLowerCase().includes(normalized)
    );
  }, [query, sessions]);

  async function chooseSession(sessionId: string) {
    if (!token) return;
    setError(null);
    setEndConfirmOpen(false);
    setSelected(await getAdminSession(sessionId, token));
  }

  async function closeSelectedSession() {
    if (!token || !selected) return;
    setClosing(true);
    setError(null);
    try {
      const result = await closeAdminSession(selected.session_id, token);
      setEndConfirmOpen(false);
      setSelected(result);
      await load(token, result.session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setClosing(false);
    }
  }

  if (!ready) return null;
  if (!token) return <AdminLogin onLogin={acceptLogin} />;

  const selectedRemaining = selected ? formatRemaining(selected.expires_at, selected.status, now) : null;
  const filteredMessages =
    transcriptFilter === "all"
      ? selected?.messages ?? []
      : selected?.messages.filter((message) => message.role === transcriptFilter) ?? [];

  return (
    <AdminShell user={user}>
      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border bg-card/95 p-5 shadow-sm xl:sticky xl:top-28 xl:flex xl:h-[calc(100vh-8rem)] xl:flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Round History</h2>
              <p className="mt-1 text-sm text-muted-foreground">All coding rounds and reports.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => token && load(token, selected?.session_id)} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <History className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rounds" className="pl-9" />
          </div>
          {error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {loading && <p className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">Loading history...</p>}
            {filteredSessions.map((session) => (
              <button
                key={session.session_id}
                type="button"
                onClick={() => chooseSession(session.session_id)}
                className={cn(
                  "w-full rounded-md border bg-background/70 p-3 text-left transition hover:border-primary/60",
                  selected?.session_id === session.session_id && "border-primary bg-primary/10"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    {session.candidate_name}
                    {session.suspicious_flags && session.suspicious_flags.length > 0 && (
                      <span title={`${session.suspicious_flags.length} warning(s)`}>
                        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </span>
                  <Badge variant={session.status === "active" ? "outline" : "secondary"}>{displayStatus(session.status)}</Badge>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{session.room_title}</span>
                <span className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{session.room_code}</span>
                  <span>{formatRemaining(session.expires_at, session.status, now)}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {session.report_ready ? "Report ready" : "No report"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          {!selected ? (
            <div className="rounded-lg border bg-card/95 p-8 text-sm text-muted-foreground">Select a round to inspect.</div>
          ) : (
            <>
              <div className="rounded-lg border bg-card/95 p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold">{selected.candidate_name}</h2>
                      <Badge variant={selected.status === "active" ? "outline" : "secondary"}>{displayStatus(selected.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{selected.candidate_email}</p>
                    <p className="mt-3 text-sm">{selected.room_title} · room {selected.room_code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "active" && (
                      <Button asChild variant="outline">
                        <Link href={`/admin/observe/${selected.session_id}`}>
                          <Eye className="h-4 w-4" />
                          Observe
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setEndConfirmOpen(true)}
                      disabled={closing || selected.status !== "active"}
                    >
                      <CircleStop className="h-4 w-4" />
                      {selected.status !== "active" ? displayStatus(selected.status) : closing ? "Ending..." : "End Session"}
                    </Button>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <Metric label="Questions" value={selected.question_count.toString()} />
                  <Metric label="Timer" value={selectedRemaining ?? `${selected.duration_minutes} min`} />
                  <Metric label="Report" value={selected.report ? "Ready" : "Pending"} />
                </div>
              </div>

              {selected.suspicious_flags && selected.suspicious_flags.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm">Suspicious Activity Detected</h4>
                      <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
                        The candidate triggered the following telemetry blocks or visibility warnings:
                      </p>
                      <ul className="mt-2 list-disc list-inside space-y-1 text-xs font-medium">
                        {selected.suspicious_flags.map((flag, idx) => (
                          <li key={idx}>{flag}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                <CollapsibleSection title="Interview Report" icon={<FileText className="h-5 w-5 text-primary" />} defaultOpen>
                    {selected.report ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-md border bg-background/70 p-4">
                          <p className="text-sm text-muted-foreground">Recommendation</p>
                          <p className="mt-1 text-xl font-semibold">{selected.report.recommendation}</p>
                        </div>
                        <div className="prose prose-sm max-w-none rounded-md border bg-background/70 p-4 dark:prose-invert">
                          <ReactMarkdown>{selected.report.summary}</ReactMarkdown>
                        </div>
                        <pre className="overflow-auto rounded-md border bg-background/70 p-4 text-xs text-muted-foreground">
                          {JSON.stringify(selected.report.rubric, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-md border border-dashed bg-background/70 p-5 text-sm text-muted-foreground">
                        End the session to generate the report.
                      </div>
                    )}
                </CollapsibleSection>

                <CollapsibleSection title="Final Code and Template Diff" icon={<GitCompare className="h-5 w-5 text-primary" />} defaultOpen>
                    <div className="mt-4 space-y-4">
                      {selected.code_snapshots.map((snapshot, index) => (
                        <div key={snapshot.question_id} className="rounded-md border bg-background/70">
                          <div className="border-b p-3">
                            <p className="text-xs text-muted-foreground">Question {index + 1}</p>
                            <p className="font-medium">{snapshot.question_title}</p>
                          </div>
                          <div className="grid gap-0 lg:grid-cols-2">
                            <div className="border-b p-3 lg:border-b-0 lg:border-r">
                              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Final Code</p>
                              <pre className="max-h-80 overflow-auto text-xs">{snapshot.final_code || "# No code synced"}</pre>
                            </div>
                            <div className="p-3">
                              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Diff from Template</p>
                              <pre className="max-h-80 overflow-auto text-xs">
                                {snapshot.diff.length > 0
                                  ? snapshot.diff.map((line, lineIndex) => {
                                      const tone = line.startsWith("+")
                                        ? "text-emerald-600 dark:text-emerald-300"
                                        : line.startsWith("-")
                                          ? "text-rose-600 dark:text-rose-300"
                                          : "text-muted-foreground";
                                      return (
                                        <span key={`${snapshot.question_id}-${lineIndex}`} className={tone}>
                                          {line}
                                          {"\n"}
                                        </span>
                                      );
                                    })
                                  : "No changes from starter template."}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 rounded-md border bg-background/70 p-4">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Code Evaluation by AI</p>
                      {selected.report ? (
                        <div className="mt-2 space-y-2 text-sm">
                          <p className="font-semibold">{selected.report.recommendation}</p>
                          <div className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert">
                            <ReactMarkdown>{selected.report.summary}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">End the session to generate code evaluation.</p>
                      )}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Question Set" icon={<CheckCircle2 className="h-5 w-5 text-primary" />}>
                    <div className="mt-4 space-y-3">
                      {selected.questions.map((question, index) => (
                        <div key={question.id} className="rounded-md border bg-background/70 p-3">
                          <p className="text-xs text-muted-foreground">Question {index + 1}</p>
                          <p className="mt-1 font-medium">{question.title}</p>
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{question.sample_input_output}</pre>
                        </div>
                      ))}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Transcript" icon={<MessageSquareText className="h-5 w-5 text-primary" />}>
                    <div className="flex flex-col gap-3">
                      <div className="flex rounded-md border bg-background p-1">
                        {(["all", "user", "assistant"] as const).map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setTranscriptFilter(item)}
                            className={`flex-1 rounded-sm px-2 py-1 text-xs capitalize ${
                              transcriptFilter === item
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 max-h-[560px] space-y-3 overflow-auto pr-1">
                      {filteredMessages.map((message) => (
                        <div key={message.id} className="rounded-md border bg-background/70 p-3 text-sm">
                          <p className="mb-1 text-xs uppercase text-muted-foreground">{message.role}</p>
                          <p className="leading-6">{message.message}</p>
                        </div>
                      ))}
                      {filteredMessages.length === 0 && <p className="text-sm text-muted-foreground">No matching chat messages.</p>}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Telemetry Captured" icon={<Activity className="h-5 w-5 text-primary" />}>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Session start, code syncs, typing-speed samples, tab visibility changes, blocked copy/paste/cut attempts, chat turns, assistant responses, admin/candidate end actions, and timer expiry.
                    </p>
                    <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
                      {selected.telemetry.map((event) => (
                        <div key={event.id} className="rounded-md border bg-background/70 p-3 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{event.event_type}</span>
                            <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      ))}
                      {selected.telemetry.length === 0 && <p className="text-sm text-muted-foreground">No telemetry recorded.</p>}
                    </div>
                </CollapsibleSection>
              </div>
            </>
          )}
        </section>
      </div>

      {endConfirmOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-end-session-title"
            className="w-full max-w-md rounded-lg border bg-card p-5 shadow-2xl shadow-black/25"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <CircleStop className="h-5 w-5" />
              </div>
              <div>
                <h2 id="admin-end-session-title" className="text-lg font-semibold">
                  End {selected.candidate_name}'s session?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This will close the candidate link, stop further edits, and generate the interview report from the saved code and transcript.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-md border bg-background/70 p-3 text-sm">
              <p className="font-medium">{selected.room_title}</p>
              <p className="mt-1 text-muted-foreground">Room {selected.room_code} · {selectedRemaining ?? selected.status}</p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEndConfirmOpen(false)} disabled={closing}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={closeSelectedSession}
                disabled={closing || selected.status !== "active"}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <CircleStop className="h-4 w-4" />
                {closing ? "Ending..." : "End Session"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function formatRemaining(expiresAt: string | null, status: string, now: number) {
  if (status !== "active") return displayStatus(status);
  if (!expiresAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function displayStatus(status: string) {
  if (status === "expired") return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border bg-card/95 p-5 shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </summary>
      {children}
    </details>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
