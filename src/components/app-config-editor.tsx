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

export function AppConfigEditor() {
  const router = useRouter();
  const [config, setConfig] = useState<ResolvedAppConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/settings/app-config");
    if (!res.ok) return;
    const data = await res.json();
    setConfig(data.config ?? null);
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function refreshModels(baseUrl?: string | null) {
    const url = baseUrl ?? config?.ollamaBaseUrl;
    if (!url) {
      setModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      const res = await fetch(
        `/api/settings/ollama/models?baseUrl=${encodeURIComponent(url)}`
      );
      const data = await res.json().catch(() => ({}));
      setModels(Array.isArray(data.models) ? data.models : []);
    } finally {
      setLoadingModels(false);
    }
  }

  useEffect(() => {
    if (config?.ollamaBaseUrl) {
      void refreshModels(config.ollamaBaseUrl);
    }
  }, [config?.ollamaBaseUrl]);

  function updateConfig<K extends keyof ResolvedAppConfig>(
    key: K,
    value: ResolvedAppConfig[K]
  ) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
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
        Configure non-sensitive app behavior here. Secrets such as database credentials,
        OAuth client secrets, and webhook keys stay in <code>.env</code>.
      </p>

      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <label htmlFor="ollama-base-url" style={fieldLabelStyle}>
            Ollama base URL
          </label>
          <input
            id="ollama-base-url"
            type="url"
            value={config.ollamaBaseUrl ?? ""}
            disabled={busy}
            onChange={(event) =>
              updateConfig("ollamaBaseUrl", event.target.value.trim() || null)
            }
            onBlur={() => void refreshModels(config.ollamaBaseUrl)}
            placeholder="http://localhost:11434"
            style={inputStyle}
          />
          <span style={hintStyle}>
            Local Ollama server used for summaries and transcript analysis.
          </span>
        </div>

        <div>
          <label htmlFor="ollama-model" style={fieldLabelStyle}>
            Ollama model
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="ollama-model"
              list="ollama-model-options"
              value={config.ollamaModel}
              disabled={busy}
              onChange={(event) => updateConfig("ollamaModel", event.target.value)}
              placeholder="llama3.1:8b"
              style={{ ...inputStyle, flex: "1 1 16rem" }}
            />
            <button
              type="button"
              disabled={busy || !config.ollamaBaseUrl || loadingModels}
              onClick={() => void refreshModels(config.ollamaBaseUrl)}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
              }}
            >
              {loadingModels ? "Loading…" : "Refresh models"}
            </button>
          </div>
          <datalist id="ollama-model-options">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <span style={hintStyle}>
            Pick from detected local models or type a model name manually.
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
