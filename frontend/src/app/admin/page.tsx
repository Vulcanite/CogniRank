"use client";

import Link from "next/link";
import { BookOpen, Check, Clock, Copy, History, Layers3, Mail, Search, TimerReset } from "lucide-react";
import { type ComponentType, type FormEvent, useEffect, useMemo, useState } from "react";

import { AdminLogin } from "@/components/admin-login";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSessionSummary, Question, RoomCreateResponse, createRoom, listAdminSessions, listQuestions } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/use-admin-auth";

const difficultyOrder = ["All", "Easy", "Medium", "Hard"];

function difficultyTone(difficulty: string) {
  if (difficulty === "Easy") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (difficulty === "Medium") return "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
}

export default function AdminPage() {
  const { token, user, ready, acceptLogin } = useAdminAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("All");
  const [query, setQuery] = useState("");
  const [roomTitle, setRoomTitle] = useState("Entry-Level Technical Screen");
  const [maxTokens, setMaxTokens] = useState("1000000");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedRoom, setGeneratedRoom] = useState<RoomCreateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function loadDashboard(nextToken: string) {
    setLoading(true);
    setError(null);
    try {
      const [questionResult, sessionResult] = await Promise.all([
        listQuestions(nextToken),
        listAdminSessions(nextToken),
      ]);
      setQuestions(questionResult);
      setSessions(sessionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void loadDashboard(token);
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesDifficulty = difficulty === "All" || question.difficulty === difficulty;
      const searchable = `${question.title} ${question.prompt} ${question.tags.join(" ")}`.toLowerCase();
      return matchesDifficulty && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [difficulty, query, questions]);

  const selectedQuestions = useMemo(
    () => selectedIds.map((id) => questions.find((question) => question.id === id)).filter(Boolean) as Question[],
    [questions, selectedIds]
  );

  function toggleQuestion(questionId: string) {
    setGeneratedRoom(null);
    setSelectedIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    );
  }

  async function handleCreateRoom(event: FormEvent) {
    event.preventDefault();
    if (!token || selectedIds.length === 0 || !inviteEmail.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await createRoom(
        {
          title: roomTitle,
          max_tokens: Number(maxTokens),
          duration_minutes: Number(durationMinutes),
          invite_email: inviteEmail.trim(),
          question_ids: selectedIds,
        },
        token
      );
      setGeneratedRoom(result);
      await loadDashboard(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRoomCode() {
    if (!generatedRoom) return;
    await navigator.clipboard.writeText(generatedRoom.room_code).catch(() => undefined);
  }

  if (!ready) return null;
  if (!token) return <AdminLogin onLogin={acceptLogin} />;

  const completed = sessions.filter((session) => session.status !== "active").length;
  const active = sessions.filter((session) => session.status === "active").length;

  return (
    <AdminShell user={user}>
      <div className="space-y-6">
        <form onSubmit={handleCreateRoom} className="rounded-lg border bg-card/95 shadow-sm">
          <section className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_410px]">
            <div className="border-b p-4 md:p-6 xl:border-b-0 xl:border-r">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Build a Coding Round</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose questions, invite a candidate, and set the timer in one flow.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/admin/questions">Manage bank</Link>
              </Button>
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search questions, tags, or concepts"
                  className="pl-9"
                />
              </div>
              <div className="flex rounded-md border bg-background p-1">
                {difficultyOrder.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDifficulty(item)}
                    className={cn(
                      "rounded-sm px-3 py-1.5 text-sm transition",
                      difficulty === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="mt-6 rounded-md border bg-background/70 p-6 text-sm text-muted-foreground">Loading dashboard...</div>
            ) : (
              <div className="mt-6 grid gap-3">
                {filteredQuestions.map((question) => {
                  const checked = selectedIds.includes(question.id);
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => toggleQuestion(question.id)}
                      className={cn(
                        "group rounded-lg border bg-background/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md",
                        checked && "border-primary bg-primary/10 shadow-sm"
                      )}
                    >
                      <div className="flex gap-4">
                        <span
                          className={cn(
                            "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            checked ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                          )}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{question.title}</span>
                            <Badge variant="outline" className={cn("border", difficultyTone(question.difficulty))}>
                              {question.difficulty}
                            </Badge>
                          </span>
                          <span className="mt-2 block text-sm leading-6 text-muted-foreground">{question.prompt}</span>
                          <span className="mt-3 block rounded-md border bg-card p-3 font-mono text-xs text-muted-foreground">
                            {question.sample_input_output}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
              </div>

            <aside className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Round Settings</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Access, budget, and duration.</p>
                </div>
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="roomTitle">Room Title</label>
                  <Input id="roomTitle" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="inviteEmail">Invite Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="candidate@example.com"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="durationMinutes">Round Timer</label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Questions</p>
                  <div className="max-h-64 space-y-2 overflow-auto pr-1">
                    {selectedQuestions.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">No questions selected.</div>
                    ) : (
                      selectedQuestions.map((question, index) => (
                        <div key={question.id} className="rounded-md border bg-background/70 p-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{question.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{question.difficulty}</p>
                            </div>
                            <button type="button" onClick={() => toggleQuestion(question.id)} className="text-xs text-muted-foreground hover:text-destructive">
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={submitting || selectedIds.length === 0 || !inviteEmail.trim()} className="mt-5 w-full">
                <Layers3 className="h-4 w-4" />
                {submitting ? "Creating room..." : "Generate Room Code"}
              </Button>

              {generatedRoom && (
                <div className="mt-4 rounded-lg border bg-primary p-4 text-primary-foreground shadow-sm">
                  <p className="text-sm opacity-80">Generated room code</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="font-mono text-4xl font-semibold tracking-normal">{generatedRoom.room_code}</p>
                    <Button type="button" variant="secondary" size="sm" onClick={copyRoomCode} className="shrink-0">
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <p className="mt-3 text-sm opacity-85">
                    {generatedRoom.questions.length} question round · {generatedRoom.duration_minutes} minutes
                    {generatedRoom.invite_email ? ` · invited ${generatedRoom.invite_email}` : ""}
                  </p>
                  <p className="mt-2 text-xs opacity-75">
                    One candidate interview session can be created from this room code. Admin observers are unlimited.
                  </p>
                </div>
              )}
            </aside>
          </section>
        </form>

        <section className="rounded-lg border bg-card/95 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent Coding Rounds</h2>
              <p className="mt-1 text-sm text-muted-foreground">Reports appear after a session is ended.</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/history">View history</Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-2">
            {sessions.slice(0, 5).map((session) => (
              <Link
                key={session.session_id}
                href={`/admin/history?session=${session.session_id}`}
                className="grid gap-3 rounded-md border bg-background/70 p-3 text-sm transition hover:border-primary/60 md:grid-cols-[1fr_130px_160px_120px]"
              >
                <span>
                  <span className="font-medium">{session.candidate_name}</span>
                  <span className="ml-2 text-muted-foreground">{session.room_title}</span>
                </span>
                <span className="text-muted-foreground">{formatRemaining(session.expires_at, session.status, now)}</span>
                <span className="text-muted-foreground">{session.tokens_used} tokens</span>
                <span className={session.report_ready ? "text-primary" : "text-muted-foreground"}>
                  {session.report_ready ? "Report ready" : displayStatus(session.status)}
                </span>
              </Link>
            ))}
            {sessions.length === 0 && <p className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">No candidate rounds yet.</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function formatRemaining(expiresAt: string | null, status: string, now: number) {
  if (status !== "active") return displayStatus(status);
  if (!expiresAt) return "No timer";
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function displayStatus(status: string) {
  if (status === "expired") return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border bg-card/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
