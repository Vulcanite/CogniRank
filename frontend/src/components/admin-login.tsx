"use client";

import { KeyRound, Radio, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAdmin } from "@/lib/api";
import { saveAdminAuth } from "@/lib/admin-auth";

export function AdminLogin({
  onLogin,
}: {
  onLogin: (token: string, user: string, expiresAt: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await loginAdmin(username, password);
      saveAdminAuth(result.access_token, result.username, result.expires_at);
      onLogin(result.access_token, result.username, result.expires_at);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dashboard-grid min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="surface-panel page-enter relative z-[1] mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-sm md:grid-cols-[1fr_420px]">
        <section className="paper-panel flex flex-col justify-between p-8 md:p-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="console-glow flex h-11 w-11 items-center justify-center rounded-sm bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Admin Console</p>
                <h1 className="font-mono text-3xl font-semibold leading-tight">CogniRank</h1>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <div className="max-w-xl">
            <span className="command-chip">Round control</span>
            <h2 className="mt-4 text-5xl font-semibold leading-[1.02]">
              Command center for coding evidence.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground">
              Create rooms, watch live code, review telemetry, and close sessions from one hardened admin surface.
            </p>
          </div>

          <div className="list-enter grid gap-3 sm:grid-cols-3">
            {[
              ["Rooms", "Invite gated"],
              ["Telemetry", "Captured"],
              ["Reports", "Generated"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border bg-background/58 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-primary">
                  <Radio className="h-3.5 w-3.5" />
                  <p className="font-mono text-xs font-medium uppercase">{label}</p>
                </div>
                <p className="mt-2 text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center border-l bg-background/90 p-8 backdrop-blur">
          <form onSubmit={handleLogin} className="w-full space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">Authorized admins only.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="username">
                Username
              </label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              <KeyRound className="h-4 w-4" />
              {submitting ? "Signing in..." : "Enter console"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
