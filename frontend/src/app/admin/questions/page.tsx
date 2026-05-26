"use client";

import { BookOpen, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { AdminLogin } from "@/components/admin-login";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Question,
  QuestionPayload,
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
} from "@/lib/api";
import { useAdminAuth } from "@/lib/use-admin-auth";

const emptyForm: QuestionPayload = {
  title: "",
  difficulty: "Easy",
  prompt: "",
  sample_input_output: "",
  starter_code: "import sys\n\n\ndef solve():\n    pass\n\n\nif __name__ == \"__main__\":\n    solve()\n",
  tags: [],
};

export default function QuestionBankPage() {
  const { token, user, ready, acceptLogin } = useAdminAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionPayload>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextToken: string) {
    setLoading(true);
    setError(null);
    try {
      setQuestions(await listQuestions(nextToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load(token);
  }, [token]);

  const filteredQuestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return questions;
    return questions.filter((question) =>
      `${question.title} ${question.prompt} ${question.tags.join(" ")}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, questions]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setTagInput("");
    setError(null);
    setModalOpen(true);
  }

  function startEdit(question: Question) {
    setEditingId(question.id);
    setForm({
      title: question.title,
      difficulty: question.difficulty as QuestionPayload["difficulty"],
      prompt: question.prompt,
      sample_input_output: question.sample_input_output,
      starter_code: question.starter_code,
      tags: question.tags,
    });
    setTagInput(question.tags.join(", "));
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    resetModalState();
  }

  function resetModalState() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setTagInput("");
  }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      tags: tagInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    try {
      if (editingId) {
        await updateQuestion(editingId, payload, token);
      } else {
        await createQuestion(payload, token);
      }
      resetModalState();
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      setSaving(false);
    }
  }

  async function removeQuestion(questionId: string) {
    if (!token) return;
    if (!window.confirm("Delete this unused question from the bank? Questions already attached to rooms cannot be deleted.")) return;
    setError(null);
    try {
      await deleteQuestion(questionId, token);
      await load(token);
      if (editingId === questionId) resetModalState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete question");
    }
  }

  if (!ready) return null;
  if (!token) return <AdminLogin onLogin={acceptLogin} />;

  return (
    <AdminShell user={user}>
      <section className="rounded-lg border bg-card/95 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Question Bank</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and maintain reusable coding prompts, sample IO, and starter code.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search bank"
                className="pl-9"
              />
            </div>
            <Button type="button" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>
        </div>

        {error && !modalOpen && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 grid gap-3">
          {loading ? (
            <div className="rounded-md border bg-background/70 p-5 text-sm text-muted-foreground">
              Loading questions...
            </div>
          ) : (
            filteredQuestions.map((question) => (
              <article key={question.id} className="rounded-lg border bg-background/75 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{question.title}</h3>
                      <Badge variant="outline">{question.difficulty}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{question.prompt}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {question.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => startEdit(question)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeQuestion(question.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <pre className="max-h-36 overflow-auto rounded-md border bg-card p-3 text-xs text-muted-foreground">
                    {question.sample_input_output}
                  </pre>
                  <pre className="max-h-36 overflow-auto rounded-md border bg-card p-3 text-xs text-muted-foreground">
                    {question.starter_code || "# No starter code"}
                  </pre>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveQuestion}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-modal-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border bg-card p-5 shadow-2xl shadow-black/25"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="question-modal-title" className="text-xl font-semibold">
                    {editingId ? "Edit Question" : "Add Question"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Include sample input/output and the starter code candidates should begin with.
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {error && (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="title">
                  Title
                </label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="difficulty">
                  Difficulty
                </label>
                <select
                  id="difficulty"
                  value={form.difficulty}
                  onChange={(event) =>
                    setForm({ ...form, difficulty: event.target.value as QuestionPayload["difficulty"] })
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tags">
                  Tags
                </label>
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="array, hash-map"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="prompt">
                  Prompt
                </label>
                <Textarea
                  id="prompt"
                  value={form.prompt}
                  onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  rows={5}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="sample">
                  Sample Input / Output
                </label>
                <Textarea
                  id="sample"
                  value={form.sample_input_output}
                  onChange={(event) => setForm({ ...form, sample_input_output: event.target.value })}
                  rows={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="starter">
                  Starter Code
                </label>
                <Textarea
                  id="starter"
                  value={form.starter_code}
                  onChange={(event) => setForm({ ...form, starter_code: event.target.value })}
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Question"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
