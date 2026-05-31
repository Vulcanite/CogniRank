import Link from "next/link";
import { ArrowRight, Radio, ShieldCheck, TerminalSquare, UserRound } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="dashboard-grid min-h-screen bg-background p-4 text-foreground md:p-8">
      <section className="surface-panel page-enter relative z-[1] mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-sm md:grid-cols-[1fr_360px]">
        <div className="paper-panel flex flex-col justify-between p-6 md:p-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="console-glow flex h-11 w-11 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Evaluation system</p>
              <span className="font-mono text-xl font-semibold">CogniRank</span>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="max-w-3xl py-16 md:py-24">
          <span className="command-chip">
            <Radio className="h-3.5 w-3.5 text-primary" />
            Live coding intelligence
          </span>
          <h1 className="mt-7 text-5xl font-semibold leading-[0.98] md:text-7xl">
            Interview rooms with evidence, not vibes.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Build timed coding rounds, observe live edits, capture telemetry, and generate structured reports from the same console.
          </p>
        </div>

        <div className="list-enter grid gap-3 md:grid-cols-2">
          <Button asChild className="h-14 justify-between px-5">
            <Link href="/admin">
              <span className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5" />
                Admin Dashboard
              </span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-14 justify-between bg-background/70 px-5">
            <Link href="/join">
              <span className="flex items-center gap-3">
                <UserRound className="h-5 w-5" />
                Join Interview
              </span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        </div>

        <aside className="hidden border-l bg-card/72 p-6 md:flex md:flex-col md:justify-between">
          <div className="list-enter space-y-4">
            <TerminalSquare className="h-8 w-8 text-primary" />
            <div className="command-rule" />
            {[
              ["ROOM", "Invite-gated access"],
              ["EDITOR", "Live snapshots"],
              ["REPORT", "Markdown evaluation"],
              ["TELEMETRY", "Typing, paste, focus"],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border/70 py-4">
                <p className="font-mono text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p className="font-mono text-xs text-muted-foreground">COGNIRANK / ADMIN + CANDIDATE</p>
        </aside>
      </section>
    </main>
  );
}
