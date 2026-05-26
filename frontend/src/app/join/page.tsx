"use client";

import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinRoom } from "@/lib/api";
import { saveCandidateSessionAccess } from "@/lib/candidate-session";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await joinRoom({
        room_code: roomCode.toUpperCase(),
        candidate_name: name,
        candidate_email: email,
      });
      saveCandidateSessionAccess(result.session_id, result.session_token);
      router.push(`/interview/${result.session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-grid flex min-h-screen items-center justify-center bg-background p-4 text-foreground md:p-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-2xl shadow-black/10 md:grid-cols-[0.9fr_1fr]">
        <div className="paper-panel hidden flex-col justify-between p-8 md:flex">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <UserRound className="h-5 w-5" />
              </div>
              <span className="font-semibold">Candidate Entry</span>
            </div>
            <ThemeToggle />
          </div>
          <div>
            <p className="text-sm font-medium uppercase text-muted-foreground">Interview session</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              Join with the room code from your interviewer.
            </h1>
          </div>
          <div className="rounded-md border bg-background/65 p-4 text-sm text-muted-foreground">
            Secure candidate workspace
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-8 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <UserRound className="h-5 w-5" />
              </div>
              <span className="font-semibold">Candidate Entry</span>
            </div>
            <ThemeToggle />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">Join Interview</h1>
              <p className="mt-1 text-sm text-muted-foreground">Candidate profile</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Candidate Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="code">
                Room Code
              </label>
              <Input
                id="code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="XJ799B"
                maxLength={6}
                className="text-center font-mono text-lg"
                required
              />
            </div>

            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              <KeyRound className="h-4 w-4" />
              {loading ? "Joining..." : "Start Interview"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
