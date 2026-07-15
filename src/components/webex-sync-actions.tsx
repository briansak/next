"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WebexSyncActions({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "sync" | "register-webhooks") {
    setLoading(action);
    setError(null);
    setResult(null);

    const res = await fetch("/api/integrations/webex/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    setLoading(null);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Action failed");
      return;
    }

    if (action === "sync") {
      const parts = [
        `Messages: ${data.fetched} fetched, ${data.ingested} new, ${data.updated} updated`,
      ];
      if (data.meetings) {
        const meetingParts = [
          `Meetings: ${data.meetings.fetched} fetched`,
          `${data.meetings.ingested} new`,
          `${data.meetings.updated} updated`,
        ];
        if (data.meetings.ignored > 0) {
          meetingParts.push(`${data.meetings.ignored} not relevant`);
        }
        parts.push(meetingParts.join(", "));
        if (data.meetings.connectorEmails?.length) {
          parts.push(`Webex account: ${data.meetings.connectorEmails.join(", ")}`);
        }
      }
      if (data.meetings?.error) {
        parts.push(data.meetings.error);
      } else if (data.meetingsWarning) {
        parts.push(`Meetings note: ${data.meetingsWarning}`);
      }
      setResult(parts.join(" · "));
    } else {
      setResult(`Registered ${data.webhookIds?.length ?? 0} webhooks`);
    }

    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <ActionButton
          label={loading === "sync" ? "Syncing…" : "Sync now"}
          onClick={() => runAction("sync")}
          disabled={disabled || !!loading}
        />
        <ActionButton
          label={loading === "register-webhooks" ? "Registering…" : "Register webhooks"}
          onClick={() => runAction("register-webhooks")}
          disabled={disabled || !!loading}
          secondary
        />
      </div>
      {result && (
        <p style={{ color: "var(--low)", fontSize: "0.875rem" }}>{result}</p>
      )}
      {error && (
        <p style={{ color: "var(--critical)", fontSize: "0.875rem" }}>{error}</p>
      )}
      {result?.includes("missing meeting scopes") && (
        <p style={{ color: "var(--critical)", fontSize: "0.875rem" }}>
          Reconnect Webex: ingestion settings → Connect Webex (re-authorize).
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  secondary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: secondary ? "transparent" : "var(--accent)",
        color: secondary ? "var(--text)" : "#fff",
        border: secondary ? "1px solid var(--border)" : "none",
        padding: "0.5rem 1rem",
        borderRadius: 8,
        fontSize: "0.875rem",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}
