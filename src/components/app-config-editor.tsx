"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ResolvedAppConfig {
  ollamaBaseUrl: string | null;
  ollamaModel: string;
  enableIngestionPoll: boolean;
  ingestionPollIntervalMs: number;
  enableGongEmailCorrelation: boolean;
  enableMeetingOllamaSummary: boolean;
  partnerAskSlaHours: number;
}

const fieldLabelStyle = {
  display: "block",
  fontWeight: 500,
  fontSize: "0.875rem",
  marginBottom: "0.35rem",
} as const;

const hintStyle = {
  display: "block",
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  lineHeight: 1.5,
  marginTop: "0.25rem",
} as const;

const inputStyle = {
  width: "100%",
  maxWidth: "28rem",
  padding: "0.5rem 0.65rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.875rem",
} as const;

const inlineButtonStyle = {
  padding: "0.5rem 0.85rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.875rem",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

export function AppConfigEditor() {
  const router = useRouter();
  const [config, setConfig] = useState<ResolvedAppConfig | null>(null);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoadedForUrl, setModelsLoadedForUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingOllamaUrl, setSavingOllamaUrl] = useState(false);
  const [savingOllamaModel, setSavingOllamaModel] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ollamaMessage, setOllamaMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/settings/app-config");
    if (!res.ok) return;
    const data = await res.json();
    const nextConfig = data.config ?? null;
    setConfig(nextConfig);
    setOllamaUrlDraft(nextConfig?.ollamaBaseUrl ?? "");
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const probeModels = useCallback(async (baseUrl: string | null) => {
    const trimmed = baseUrl?.trim();
    if (!trimmed) {
      setModels([]);
      setModelsLoadedForUrl(null);
      return [];
    }

    setLoadingModels(true);
    setOllamaMessage(null);
    try {
      const res = await fetch(
        `/api/settings/ollama/models?baseUrl=${encodeURIComponent(trimmed)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModels([]);
        setModelsLoadedForUrl(null);
        setOllamaMessage(data.error ?? "Could not reach Ollama at that URL.");
        return [];
      }

      const nextModels = Array.isArray(data.models) ? data.models : [];
      setModels(nextModels);
      setModelsLoadedForUrl(trimmed);
      if (nextModels.length === 0) {
        setOllamaMessage("Connected, but no models were reported. Pull a model in Ollama first.");
      } else {
        setOllamaMessage(`Found ${nextModels.length} model${nextModels.length === 1 ? "" : "s"}.`);
      }
      return nextModels;
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (config?.ollamaBaseUrl) {
      void probeModels(config.ollamaBaseUrl);
    }
  }, [config?.ollamaBaseUrl, probeModels]);

  function updateConfig<K extends keyof ResolvedAppConfig>(
    key: K,
    value: ResolvedAppConfig[K]
  ) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveOllamaUrl() {
    if (!config) return;

    const nextUrl = ollamaUrlDraft.trim() || null;
    setSavingOllamaUrl(true);
    setError(null);
    setOllamaMessage(null);

    try {
      const res = await fetch("/api/settings/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaBaseUrl: nextUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save Ollama URL");
        return;
      }

      const savedConfig = data.config ?? { ...config, ollamaBaseUrl: nextUrl };
      setConfig(savedConfig);
      setOllamaUrlDraft(savedConfig.ollamaBaseUrl ?? "");
      router.refresh();

      if (savedConfig.ollamaBaseUrl) {
        const discovered = await probeModels(savedConfig.ollamaBaseUrl);
        if (
          discovered.length > 0 &&
          savedConfig.ollamaModel &&
          !discovered.includes(savedConfig.ollamaModel)
        ) {
          await saveOllamaModel(discovered[0]!, { silent: true });
        }
      } else {
        setModels([]);
        setModelsLoadedForUrl(null);
        setOllamaMessage("Ollama URL cleared.");
      }
    } finally {
      setSavingOllamaUrl(false);
    }
  }

  async function saveOllamaModel(
    model: string,
    options?: { silent?: boolean }
  ) {
    if (!config || !model.trim()) return;

    setSavingOllamaModel(true);
    if (!options?.silent) {
      setError(null);
    }

    try {
      const res = await fetch("/api/settings/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaModel: model.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!options?.silent) {
          setError(data.error ?? "Could not save Ollama model");
        }
        return;
      }
      setConfig(data.config ?? { ...config, ollamaModel: model.trim() });
      if (!options?.silent) {
        setOllamaMessage(`Using model ${model.trim()}.`);
      }
      router.refresh();
    } finally {
      setSavingOllamaModel(false);
    }
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;

    setBusy(true);
    setError(null);
    setSavedMessage(null);

    try {
      const res = await fetch("/api/settings/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save configuration");
        return;
      }
      setConfig(data.config ?? config);
      setSavedMessage("Configuration saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const modelOptions =
    config?.ollamaModel && !models.includes(config.ollamaModel)
      ? [config.ollamaModel, ...models]
      : models;

  const showModelPicker =
    Boolean(config?.ollamaBaseUrl) &&
    modelsLoadedForUrl === config?.ollamaBaseUrl &&
    modelOptions.length > 0;

  if (!config) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
        Loading configuration…
      </p>
    );
  }

  return (
    <form onSubmit={saveConfig}>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          marginBottom: "1.25rem",
          lineHeight: 1.5,
        }}
      >
        Configure app behavior here. Sensitive values such as Webex OAuth credentials are saved
        under <strong>Settings → Webex</strong> and encrypted locally.
      </p>

      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <label htmlFor="ollama-base-url" style={fieldLabelStyle}>
            Ollama base URL
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxWidth: "32rem" }}>
            <input
              id="ollama-base-url"
              type="url"
              value={ollamaUrlDraft}
              disabled={busy || savingOllamaUrl}
              onChange={(event) => setOllamaUrlDraft(event.target.value)}
              placeholder="http://localhost:11434"
              style={{ ...inputStyle, flex: "1 1 16rem", maxWidth: "none" }}
            />
            <button
              type="button"
              disabled={busy || savingOllamaUrl || loadingModels}
              onClick={() => void saveOllamaUrl()}
              style={{
                ...inlineButtonStyle,
                background: "var(--accent)",
                borderColor: "var(--accent)",
                color: "#fff",
                opacity: busy || savingOllamaUrl || loadingModels ? 0.7 : 1,
              }}
            >
              {savingOllamaUrl || loadingModels ? "Saving…" : "Save URL"}
            </button>
          </div>
          <span style={hintStyle}>
            Save your local Ollama server URL, then pick a model from the list below.
          </span>
          {ollamaMessage ? (
            <span style={{ ...hintStyle, color: "var(--text)" }}>{ollamaMessage}</span>
          ) : null}
        </div>

        <div>
          <label htmlFor="ollama-model" style={fieldLabelStyle}>
            Ollama model
          </label>
          {showModelPicker ? (
            <select
              id="ollama-model"
              value={config.ollamaModel}
              disabled={busy || savingOllamaModel}
              onChange={(event) => void saveOllamaModel(event.target.value)}
              style={{ ...inputStyle, maxWidth: "32rem" }}
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="ollama-model"
              value={config.ollamaModel}
              disabled
              placeholder={
                config.ollamaBaseUrl
                  ? loadingModels
                    ? "Loading models…"
                    : "Save URL to load models"
                  : "Save an Ollama URL first"
              }
              style={{ ...inputStyle, maxWidth: "32rem", opacity: 0.7 }}
            />
          )}
          <span style={hintStyle}>
            {showModelPicker
              ? "Model changes save immediately."
              : "Available models appear here after you save a reachable Ollama URL."}
          </span>
        </div>

        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={config.enableIngestionPoll}
            disabled={busy}
            onChange={(event) => updateConfig("enableIngestionPoll", event.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Auto-poll integrations
            </span>
            <span style={hintStyle}>
              Periodically re-scan Webex, Apple Mail, and Apple Calendar while the app
              is running.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="poll-interval" style={fieldLabelStyle}>
            Auto-poll interval (minutes)
          </label>
          <input
            id="poll-interval"
            type="number"
            min={1}
            max={60}
            value={Math.round(config.ingestionPollIntervalMs / 60_000)}
            disabled={busy || !config.enableIngestionPoll}
            onChange={(event) => {
              const minutes = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(minutes)) return;
              updateConfig("ingestionPollIntervalMs", minutes * 60_000);
            }}
            style={{ ...inputStyle, maxWidth: "8rem" }}
          />
        </div>

        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={config.enableGongEmailCorrelation}
            disabled={busy}
            onChange={(event) =>
              updateConfig("enableGongEmailCorrelation", event.target.checked)
            }
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Gong email summaries
            </span>
            <span style={hintStyle}>
              Match Gong recap emails to Webex meetings and merge summaries into meeting
              cards.
            </span>
          </span>
        </label>

        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={config.enableMeetingOllamaSummary}
            disabled={busy}
            onChange={(event) =>
              updateConfig("enableMeetingOllamaSummary", event.target.checked)
            }
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Ollama meeting transcript summaries
            </span>
            <span style={hintStyle}>
              Generate richer summaries from Webex transcripts during ingest and replay
              enrichment.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="partner-sla" style={fieldLabelStyle}>
            Partner response SLA (hours)
          </label>
          <input
            id="partner-sla"
            type="number"
            min={1}
            max={720}
            value={config.partnerAskSlaHours}
            disabled={busy}
            onChange={(event) => {
              const hours = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(hours)) return;
              updateConfig("partnerAskSlaHours", hours);
            }}
            style={{ ...inputStyle, maxWidth: "8rem" }}
          />
          <span style={hintStyle}>
            Partner asks show warning badges after half this window and overdue badges
            after the full window.
          </span>
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--critical)", fontSize: "0.8rem", marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}

      {savedMessage ? (
        <p style={{ color: "var(--success, #15803d)", fontSize: "0.8rem", marginTop: "1rem" }}>
          {savedMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        style={{
          marginTop: "1.25rem",
          padding: "0.55rem 1rem",
          borderRadius: 8,
          border: "none",
          background: "var(--accent)",
          color: "white",
          cursor: busy ? "wait" : "pointer",
          fontWeight: 500,
        }}
      >
        {busy ? "Saving…" : "Save configuration"}
      </button>
    </form>
  );
}
