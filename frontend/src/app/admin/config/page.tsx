"use client";

import { Save, SlidersHorizontal } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { AdminLogin } from "@/components/admin-login";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AIConfiguration, getAIConfiguration, updateAIConfiguration } from "@/lib/api";
import { useAdminAuth } from "@/lib/use-admin-auth";

const emptyConfig: AIConfiguration = {
  api_url: "",
  model: "",
  system_prompt: "",
  report_prompt: "",
  force_brute_force: false,
  updated_at: "",
};

export default function ConfigPage() {
  const { token, user, ready, acceptLogin } = useAdminAuth();
  const [config, setConfig] = useState<AIConfiguration>(emptyConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load(nextToken: string) {
    setLoading(true);
    setError(null);
    try {
      setConfig(await getAIConfiguration(nextToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load(token);
  }, [token]);

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      setConfig(await updateAIConfiguration(config, token));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;
  if (!token) return <AdminLogin onLogin={acceptLogin} />;

  return (
    <AdminShell user={user}>
      <form onSubmit={saveConfig} className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-lg border bg-card/95 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">AI Configuration</h2>
              <p className="mt-1 text-sm text-muted-foreground">Runtime settings for chat orchestration and reports.</p>
            </div>
            <SlidersHorizontal className="h-5 w-5 text-primary" />
          </div>

          {loading ? (
            <p className="mt-5 rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">Loading configuration...</p>
          ) : (
            <div className="mt-5 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="apiUrl">AI API URL</label>
                  <Input
                    id="apiUrl"
                    value={config.api_url}
                    onChange={(event) => setConfig({ ...config, api_url: event.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="model">Model</label>
                  <Input
                    id="model"
                    value={config.model}
                    onChange={(event) => setConfig({ ...config, model: event.target.value })}
                    placeholder="openai/gpt-4o-mini"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 rounded-md border p-4 bg-background/50">
                <input
                  type="checkbox"
                  id="forceBruteForce"
                  checked={config.force_brute_force}
                  onChange={(event) => setConfig({ ...config, force_brute_force: event.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="space-y-1">
                  <label className="text-sm font-medium leading-none cursor-pointer" htmlFor="forceBruteForce">
                    Enforce Brute-Force Solutions
                  </label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, the AI assistant will only generate unoptimized brute-force code to test the candidate's code analysis capabilities.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="systemPrompt">Rubber Duck System Prompt</label>
                <Textarea
                  id="systemPrompt"
                  value={config.system_prompt}
                  onChange={(event) => setConfig({ ...config, system_prompt: event.target.value })}
                  rows={10}
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reportPrompt">Report Prompt</label>
                <Textarea
                  id="reportPrompt"
                  value={config.report_prompt}
                  onChange={(event) => setConfig({ ...config, report_prompt: event.target.value })}
                  rows={7}
                  className="font-mono text-xs"
                  required
                />
              </div>
            </div>
          )}

          {error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {saved && <p className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">Configuration saved.</p>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Last updated: {config.updated_at ? new Date(config.updated_at).toLocaleString() : "Never"}
            </p>
            <Button type="submit" disabled={saving || loading}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </section>
      </form>
    </AdminShell>
  );
}
