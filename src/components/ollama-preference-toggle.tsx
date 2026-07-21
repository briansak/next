"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface OllamaPreferenceToggleProps {
  enabled: boolean;
  available: boolean;
}

export function OllamaPreferenceToggle({
  enabled,
  available,
}: OllamaPreferenceToggleProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: boolean) {
    setChecked(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowOllamaSummaries: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChecked(!next);
        setError(data.error ?? "Could not save preference");
        return;
      }
      router.refresh();
    } catch {
      setChecked(!next);
      setError("Could not save preference");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          cursor: available ? "pointer" : "not-allowed",
          opacity: available ? 1 : 0.65,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={!available || busy}
          onChange={(event) => onChange(event.target.checked)}
          style={{ marginTop: "0.2rem" }}
        />
        <span>
          <span style={{ display: "block", fontWeight: 500, fontSize: "0.875rem" }}>
            Use local Ollama for dashboard summaries
          </span>
          <span
            style={{
              display: "block",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
              marginTop: "0.2rem",
            }}
          >
            {available
              ? "When enabled, My Priorities may call your configured Ollama instance for richer card summaries. Data stays on your machine."
              : "Set an Ollama base URL in Settings → Preferences and ensure Ollama is running to enable this option."}
          </span>
        </span>
      </label>
      {error ? (
        <p style={{ color: "var(--critical)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
