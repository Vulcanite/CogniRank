"use client";

import { Save, SlidersHorizontal } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { AdminLogin } from "@/components/admin-login";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LLMConfiguration, getLLMConfiguration, listLLMModels, updateLLMConfiguration } from "@/lib/api";
import { useAdminAuth } from "@/lib/use-admin-auth";

const emptyConfig: LLMConfiguration = {
  api_url: "",
  api_key_configured: false,
  model: "",
  system_prompt: "",
  chat_context_prompt: "",
  brute_force_prompt: "",
  report_prompt: "",
  force_brute_force: false,
  updated_at: "",
};

export default function ConfigPage() {
  const { token, user, ready, acceptLogin } = useAdminAuth();
  const [config, setConfig] = useState<LLMConfiguration>(emptyConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function loadModels(nextToken: string, apiUrl: string, nextApiKey = "") {
    if (!apiUrl.trim()) return;
    setLoadingModels(true);
    setModelError(null);
    try {
      const result = await listLLMModels(
        {
          api_url: apiUrl.trim(),
          api_key: nextApiKey.trim() || null,
        },
        nextToken
      );
      setModels(result.models);
    } catch (err) {
      setModels([]);
      setModelError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  }

  async function load(nextToken: string) {
    setLoading(true);
    setError(null);
    try {
      const nextConfig = await getLLMConfiguration(nextToken);
      setConfig(nextConfig);
      await loadModels(nextToken, nextConfig.api_url);
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
      setConfig(await updateLLMConfiguration({ ...config, api_key: apiKey.trim() || null }, token));
      setApiKey("");
      setShowApiKey(false);
      setSaved(true);
      await loadModels(token, config.api_url, apiKey);
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
      <form onSubmit={saveConfig} className="page-enter mx-auto max-w-5xl space-y-6">
        <section className="surface-panel rounded-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Settings</h2>
              <p className="mt-1 text-sm text-muted-foreground">LLM provider, model, prompts, and interview behavior.</p>
            </div>
            <SlidersHorizontal className="h-5 w-5 text-primary" />
          </div>

          {loading ? (
            <p className="mt-5 rounded-sm border bg-background/70 p-4 text-sm text-muted-foreground">Loading configuration...</p>
          ) : (
            <div className="mt-5 grid gap-5">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="apiUrl">LLM Provider URL</label>
                  <Input
                    id="apiUrl"
                    value={config.api_url}
                    onChange={(event) => setConfig({ ...config, api_url: event.target.value })}
                    onBlur={() => token && loadModels(token, config.api_url, apiKey)}
                    placeholder="https://openrouter.ai/api/v1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="model">Model</label>
                  <select
                    id="model"
                    value={config.model}
                    onChange={(event) => setConfig({ ...config, model: event.target.value })}
                    className="h-10 w-full rounded-sm border border-input bg-background/80 px-3 text-sm"
                    required
                  >
                    {config.model && !models.includes(config.model) && (
                      <option value={config.model}>{config.model}</option>
                    )}
                    {models.length === 0 && (
                      <option value={config.model}>
                        {loadingModels ? "Loading models..." : config.model || "No models loaded"}
                      </option>
                    )}
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  {modelError && <p className="text-xs text-destructive">{modelError}</p>}
                </div>
              </div>

              <div className="rounded-sm border bg-background/58 p-4">
                <div className="flex items-center justify-between gap-4 text-sm font-medium">
                  <label htmlFor="updateLlmKey">Update LLM Key</label>
                  <label className="relative inline-flex h-6 w-11 cursor-pointer items-center" htmlFor="updateLlmKey">
                    <input
                      id="updateLlmKey"
                      type="checkbox"
                      role="switch"
                      checked={showApiKey}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setShowApiKey(checked);
                        if (!checked) setApiKey("");
                      }}
                      className="peer sr-only"
                    />
                    <span className="absolute inset-0 rounded-full border border-input bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
                    <span
                      className="absolute left-1 top-1 h-4 w-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
                    />
                  </label>
                </div>
                {showApiKey && (
                  <div className="mt-4 space-y-2">
                    <label className="text-sm font-medium" htmlFor="apiKey">LLM Provider Key</label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      onBlur={() => token && apiKey.trim() && loadModels(token, config.api_url, apiKey)}
                      placeholder="Paste provider key"
                      autoComplete="new-password"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 rounded-sm border bg-background/58 p-4">
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
                    When enabled, the LLM assistant will only generate unoptimized brute-force code to test the candidate's code analysis capabilities.
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
                <label className="text-sm font-medium" htmlFor="chatContextPrompt">Active Question Context Prompt</label>
                <Textarea
                  id="chatContextPrompt"
                  value={config.chat_context_prompt}
                  onChange={(event) => setConfig({ ...config, chat_context_prompt: event.target.value })}
                  rows={5}
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="bruteForcePrompt">Brute-Force Enforcement Prompt</label>
                <Textarea
                  id="bruteForcePrompt"
                  value={config.brute_force_prompt}
                  onChange={(event) => setConfig({ ...config, brute_force_prompt: event.target.value })}
                  rows={6}
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

          {error && <p className="mt-4 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {saved && <p className="mt-4 rounded-sm border border-primary/30 bg-primary/10 p-3 text-sm text-primary">Settings saved.</p>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Last updated: {config.updated_at ? new Date(config.updated_at).toLocaleString() : "Never"}
            </p>
            <Button type="submit" disabled={saving || loading}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </section>
      </form>
    </AdminShell>
  );
}
