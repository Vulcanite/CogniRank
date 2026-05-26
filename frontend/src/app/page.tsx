import Link from "next/link";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="dashboard-grid min-h-screen bg-background p-4 text-foreground md:p-8">
      <section className="paper-panel mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between rounded-lg border p-6 shadow-2xl shadow-black/10 md:p-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="font-semibold">Interview Platform</span>
          </div>
          <ThemeToggle />
        </header>

        <div className="max-w-3xl py-16">
          <h1 className="text-5xl font-semibold leading-tight md:text-7xl">
            Build interview rooms around reasoning, not autocomplete.
          </h1>   
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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
      </section>
    </main>
  );
}
