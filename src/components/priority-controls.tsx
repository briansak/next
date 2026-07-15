"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" },
] as const;

interface PriorityControlsProps {
  communicationId: string;
  priority: string;
  overridden?: boolean;
  hidden?: boolean;
  compact?: boolean;
}

export function PriorityControls({
  communicationId,
  priority,
  overridden = false,
  hidden = false,
  compact = false,
}: PriorityControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updatePriority(
    payload:
      | { priority: string; hidden?: boolean }
      | { hidden: boolean }
      | { reset: true }
  ) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/communications/${communicationId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not update priority");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        gap: compact ? "0.35rem" : "0.5rem",
        alignItems: compact ? "center" : "stretch",
        flexShrink: 0,
      }}
    >
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.2rem",
          fontSize: "0.72rem",
          color: "var(--text-muted)",
        }}
      >
        {compact ? null : "Your priority"}
        <select
          value={priority}
          disabled={loading || hidden}
          onChange={(event) =>
            updatePriority({ priority: event.target.value, hidden: false })
          }
          style={{
            fontSize: "0.75rem",
            padding: "0.35rem 0.45rem",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            minWidth: compact ? "6.5rem" : "8rem",
          }}
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {!compact ? (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => updatePriority({ priority: "INFO", hidden: true })}
            style={buttonStyle("secondary")}
          >
            Hide from dashboard
          </button>
          {overridden || hidden ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => updatePriority({ reset: true })}
              style={buttonStyle("ghost")}
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          title="Hide from dashboard"
          onClick={() => updatePriority({ priority: "INFO", hidden: true })}
          style={buttonStyle("ghost")}
        >
          Hide
        </button>
      )}

      {!compact && overridden && !hidden ? (
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          Using your priority instead of the automatic score.
        </span>
      ) : null}

      {!compact && hidden ? (
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          Hidden from your dashboard. Reset to show again.
        </span>
      ) : null}

      {error ? (
        <span style={{ fontSize: "0.7rem", color: "var(--high)" }}>{error}</span>
      ) : null}
    </div>
  );
}

function buttonStyle(variant: "secondary" | "ghost"): React.CSSProperties {
  if (variant === "secondary") {
    return {
      fontSize: "0.72rem",
      padding: "0.35rem 0.55rem",
      borderRadius: 6,
      border: "1px solid var(--border)",
      background: "var(--surface)",
      color: "var(--text)",
      cursor: "pointer",
    };
  }

  return {
    fontSize: "0.72rem",
    padding: "0.35rem 0.55rem",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  };
}
