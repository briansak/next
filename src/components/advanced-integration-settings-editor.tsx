"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdvancedSettings {
  enablePstImport: boolean;
  readpstBin: string;
  unzipBin: string;
  enableRecordingTranscription: boolean;
  whisperBin: string;
  whisperModel: string;
  appleMailPath: string | null;
  appleMailLookbackDays: number;
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

export function AdvancedIntegrationSettingsEditor() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdvancedSettings | null>(null);
  const [pollSecret, setPollSecret] = useState("");
  const [pollSecretConfigured, setPollSecretConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const [configRes, secretsRes] = await Promise.all([
      fetch("/api/settings/app-config"),
      fetch("/api/settings/secrets"),
    ]);
    if (configRes.ok) {
      const data = await configRes.json();
      const config = data.config;
      if (config) {
        setSettings({
          enablePstImport: Boolean(config.enablePstImport),
          readpstBin: config.readpstBin ?? "readpst",
          unzipBin: config.unzipBin ?? "unzip",
          enableRecordingTranscription: Boolean(config.enableRecordingTranscription),
          whisperBin: config.whisperBin ?? ".venv/bin/whisper",
          whisperModel: config.whisperModel ?? "tiny",
          appleMailPath: config.appleMailPath ?? null,
          appleMailLookbackDays: config.appleMailLookbackDays ?? 14,
        });
      }
    }
    if (secretsRes.ok) {
      const data = await secretsRes.json();
      setPollSecretConfigured(Boolean(data.ingestionPollSecretConfigured));
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateSettings<K extends keyof AdvancedSettings>(
    key: K,
    value: AdvancedSettings[K]
  ) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;

    setBusy(true);
    setError(null);
    setSavedMessage(null);

    try {
      const configRes = await fetch("/api/settings/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const configData = await configRes.json().catch(() => ({}));
      if (!configRes.ok) {
        throw new Error(configData.error ?? "Could not save integration settings");
      }

      if (pollSecret.trim()) {
        const secretsRes = await fetch("/api/settings/secrets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingestionPollSecret: pollSecret.trim() }),
        });
        const secretsData = await secretsRes.json().catch(() => ({}));
        if (!secretsRes.ok) {
          throw new Error(secretsData.error ?? "Could not save poll secret");
        }
        setPollSecretConfigured(Boolean(secretsData.ingestionPollSecretConfigured));
        setPollSecret("");
      }

      setSavedMessage("Integration settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
        Loading integration settings…
      </p>
    );
  }

  return (
    <form onSubmit={saveSettings}>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={settings.enablePstImport}
            disabled={busy}
            onChange={(event) => updateSettings("enablePstImport", event.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Outlook `.pst` import
            </span>
            <span style={hintStyle}>Requires `readpst` (e.g. `brew install libpst`).</span>
          </span>
        </label>

        {settings.enablePstImport ? (
          <>
            <div>
              <label htmlFor="readpst-bin" style={fieldLabelStyle}>
                readpst binary
              </label>
              <input
                id="readpst-bin"
                value={settings.readpstBin}
                disabled={busy}
                onChange={(event) => updateSettings("readpstBin", event.target.value)}
                style={{ ...inputStyle, maxWidth: "12rem" }}
              />
            </div>
            <div>
              <label htmlFor="unzip-bin" style={fieldLabelStyle}>
                unzip binary
              </label>
              <input
                id="unzip-bin"
                value={settings.unzipBin}
                disabled={busy}
                onChange={(event) => updateSettings("unzipBin", event.target.value)}
                style={{ ...inputStyle, maxWidth: "12rem" }}
              />
            </div>
          </>
        ) : null}

        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={settings.enableRecordingTranscription}
            disabled={busy}
            onChange={(event) =>
              updateSettings("enableRecordingTranscription", event.target.checked)
            }
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Whisper recording transcription
            </span>
            <span style={hintStyle}>
              Transcribe Webex recordings locally when Webex transcripts are unavailable.
            </span>
          </span>
        </label>

        {settings.enableRecordingTranscription ? (
          <>
            <div>
              <label htmlFor="whisper-bin" style={fieldLabelStyle}>
                Whisper binary
              </label>
              <input
                id="whisper-bin"
                value={settings.whisperBin}
                disabled={busy}
                onChange={(event) => updateSettings("whisperBin", event.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="whisper-model" style={fieldLabelStyle}>
                Whisper model
              </label>
              <input
                id="whisper-model"
                value={settings.whisperModel}
                disabled={busy}
                onChange={(event) => updateSettings("whisperModel", event.target.value)}
                style={{ ...inputStyle, maxWidth: "12rem" }}
              />
            </div>
          </>
        ) : null}

        <div>
          <label htmlFor="apple-mail-path" style={fieldLabelStyle}>
            Apple Mail path (optional)
          </label>
          <input
            id="apple-mail-path"
            value={settings.appleMailPath ?? ""}
            disabled={busy}
            onChange={(event) =>
              updateSettings("appleMailPath", event.target.value.trim() || null)
            }
            placeholder="~/Library/Mail"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="apple-mail-lookback" style={fieldLabelStyle}>
            Apple Mail lookback (days)
          </label>
          <input
            id="apple-mail-lookback"
            type="number"
            min={1}
            max={365}
            value={settings.appleMailLookbackDays}
            disabled={busy}
            onChange={(event) => {
              const days = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(days)) return;
              updateSettings("appleMailLookbackDays", days);
            }}
            style={{ ...inputStyle, maxWidth: "8rem" }}
          />
        </div>

        <div>
          <label htmlFor="poll-secret" style={fieldLabelStyle}>
            Ingestion poll secret (optional)
          </label>
          <input
            id="poll-secret"
            type="password"
            autoComplete="new-password"
            value={pollSecret}
            disabled={busy}
            onChange={(event) => setPollSecret(event.target.value)}
            placeholder={
              pollSecretConfigured
                ? "Saved — enter a new value to replace"
                : "Bearer token for POST /api/integrations/poll"
            }
            style={inputStyle}
          />
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
        {busy ? "Saving…" : "Save integration settings"}
      </button>
    </form>
  );
}
