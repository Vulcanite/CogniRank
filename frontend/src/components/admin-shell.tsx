"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, History, Layers3, LogOut, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { clearAdminAuth } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: Layers3 },
  { href: "/admin/questions", label: "Question Bank", icon: BookOpen },
  { href: "/admin/history", label: "History", icon: History },
  { href: "/admin/config", label: "Settings", icon: SlidersHorizontal },
];

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearAdminAuth();
    router.push("/admin");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[284px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden border-r bg-card/88 p-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:flex-col lg:overflow-y-auto">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="console-glow flex h-11 w-11 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Admin system</p>
              <p className="font-mono text-lg font-semibold leading-tight">CogniRank</p>
            </div>
          </Link>

          <div className="command-rule mt-6" />

          <nav className="mt-10 space-y-1.5 text-sm">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "interactive-lift flex items-center gap-3 rounded-sm border px-3 py-2.5 font-medium",
                    active
                      ? "border-primary/20 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "border-transparent bg-transparent text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="surface-panel mt-auto rounded-sm p-4">
            <p className="font-mono text-xs font-medium uppercase text-muted-foreground">Signed in</p>
            <p className="mt-1 font-medium">{user}</p>
            <Button type="button" variant="outline" size="sm" onClick={logout} className="mt-4 w-full">
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <section className="dashboard-grid min-w-0">
          <header className="sticky top-0 z-10 border-b bg-background/88 px-4 py-4 backdrop-blur-xl md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2 lg:hidden">
                {navItems.map((item) => (
                  <Button key={item.href} asChild variant={pathname === item.href ? "secondary" : "outline"} size="sm">
                    <Link href={item.href}>{item.label}</Link>
                  </Button>
                ))}
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Interview operations</p>
                <h1 className="mt-1 text-3xl font-semibold">Admin Console</h1>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button type="button" variant="outline" onClick={logout} className="lg:hidden">
                  <LogOut className="h-4 w-4" />
                  Log out
                </Button>
              </div>
            </div>
          </header>

          <div className="relative z-[1] mx-auto max-w-7xl p-4 md:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
