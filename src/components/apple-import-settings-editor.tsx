"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AppleImportSettings {
  enableAppleMailImport: boolean;
  enableAppleCalendarImport: boolean;
  appleCalendarNames: string | null;
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

export function AppleImportSettingsEditor() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppleImportSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings/app-config");
    if (!res.ok) return;
    const data = await res.json();
    const config = data.config;
    if (!config) return;
    setSettings({
      enableAppleMailImport: Boolean(config.enableAppleMailImport),
      enableAppleCalendarImport: Boolean(config.enableAppleCalendarImport),
      appleCalendarNames: config.appleCalendarNames ?? null,
    });
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateSettings<K extends keyof AppleImportSettings>(
    key: K,
    value: AppleImportSettings[K]
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
      const res = await fetch("/api/settings/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enableAppleMailImport: settings.enableAppleMailImport,
          enableAppleCalendarImport: settings.enableAppleCalendarImport,
          appleCalendarNames: settings.appleCalendarNames?.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save Apple import settings");
        return;
      }
      setSavedMessage("Apple import settings saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
        Loading Apple import settings…
      </p>
    );
  }

  return (
    <form onSubmit={saveSettings}>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          marginBottom: "1rem",
          lineHeight: 1.5,
        }}
      >
        Enable local Mail.app and Calendar.app import on your Mac. macOS permissions
        (Full Disk Access and Calendars) are still required — see the{" "}
        <a href="/docs/apple-mail-calendar-getting-started">getting started guide</a>.
      </p>

      <div style={{ display: "grid", gap: "1rem" }}>
        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={settings.enableAppleMailImport}
            disabled={busy}
            onChange={(event) =>
              updateSettings("enableAppleMailImport", event.target.checked)
            }
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Import from Apple Mail
            </span>
            <span style={hintStyle}>
              Scan the local Mail.app cache under <code>~/Library/Mail</code>.
            </span>
          </span>
        </label>

        <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={settings.enableAppleCalendarImport}
            disabled={busy}
            onChange={(event) =>
              updateSettings("enableAppleCalendarImport", event.target.checked)
            }
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
              Import from Apple Calendar
            </span>
            <span style={hintStyle}>
              Read events from Calendar.app via EventKit.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="apple-calendar-names" style={fieldLabelStyle}>
            Calendar names (optional)
          </label>
          <input
            id="apple-calendar-names"
            value={settings.appleCalendarNames ?? ""}
            disabled={busy || !settings.enableAppleCalendarImport}
            onChange={(event) =>
              updateSettings("appleCalendarNames", event.target.value.trim() || null)
            }
            placeholder="Calendar, Work"
            style={inputStyle}
          />
          <span style={hintStyle}>
            Comma-separated names from the Calendar.app sidebar. Leave blank to scan
            all non-system calendars.
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
          marginTop: "1rem",
          padding: "0.55rem 1rem",
          borderRadius: 8,
          border: "none",
          background: "var(--accent)",
          color: "white",
          cursor: busy ? "wait" : "pointer",
          fontWeight: 500,
        }}
      >
        {busy ? "Saving…" : "Save Apple import settings"}
      </button>
    </form>
  );
}
