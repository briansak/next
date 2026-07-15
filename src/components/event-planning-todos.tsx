"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface EventNextStep {
  id: string;
  title: string;
  status: string;
}

interface EventPlanningTodosProps {
  communicationId: string;
  eventSubject: string;
  suggestions: string[];
  existingSteps: EventNextStep[];
}

export function EventPlanningTodos({
  communicationId,
  eventSubject,
  suggestions,
  existingSteps,
}: EventPlanningTodosProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(existingSteps);
  const [customTitle, setCustomTitle] = useState("");
  const [loadingTitle, setLoadingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableSuggestions = useMemo(() => {
    const existing = new Set(steps.map((step) => step.title.toLowerCase()));
    return suggestions.filter((title) => !existing.has(title.toLowerCase()));
  }, [steps, suggestions]);

  async function addTodo(title: string) {
    const trimmed = title.trim();
    if (!trimmed || loadingTitle) return;

    setLoadingTitle(trimmed);
    setError(null);

    try {
      const res = await fetch("/api/next-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communicationId,
          title: trimmed,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add to-do");
        return;
      }

      if (data.nextStep) {
        setSteps((current) => {
          if (
            current.some(
              (step) => step.title.toLowerCase() === data.nextStep.title.toLowerCase()
            )
          ) {
            return current;
          }
          return [...current, data.nextStep];
        });
      }

      setCustomTitle("");
      router.refresh();
    } finally {
      setLoadingTitle(null);
    }
  }

  return (
    <div
      style={{
        marginTop: "0.75rem",
        paddingTop: "0.75rem",
        borderTop: "1px solid var(--border)",
      }}
    >
      <p
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "var(--text-muted)",
          marginBottom: "0.5rem",
        }}
      >
        Prep to-dos for {eventSubject}
      </p>

      {steps.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            marginBottom: "0.65rem",
          }}
        >
          {steps.map((step) => (
            <li
              key={step.id}
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                padding: "0.35rem 0.5rem",
                background: "var(--bg)",
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              {step.title}
            </li>
          ))}
        </ul>
      )}

      {availableSuggestions.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            marginBottom: "0.65rem",
          }}
        >
          {availableSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addTodo(suggestion)}
              disabled={loadingTitle !== null}
              style={{
                fontSize: "0.72rem",
                padding: "0.3rem 0.55rem",
                borderRadius: 999,
                border: "1px solid var(--medium)",
                background: "rgba(232, 197, 91, 0.12)",
                color: "var(--text)",
                cursor: loadingTitle ? "wait" : "pointer",
              }}
            >
              {loadingTitle === suggestion ? "Adding…" : `+ ${suggestion}`}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void addTodo(customTitle);
        }}
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <input
          type="text"
          value={customTitle}
          onChange={(event) => setCustomTitle(event.target.value)}
          placeholder="Add your own prep to-do…"
          maxLength={200}
          style={{
            flex: 1,
            fontSize: "0.8rem",
            padding: "0.45rem 0.6rem",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={!customTitle.trim() || loadingTitle !== null}
          style={{
            fontSize: "0.75rem",
            padding: "0.45rem 0.75rem",
            borderRadius: 6,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor:
              !customTitle.trim() || loadingTitle ? "not-allowed" : "pointer",
            opacity: !customTitle.trim() || loadingTitle ? 0.6 : 1,
          }}
        >
          Add
        </button>
      </form>

      {error ? (
        <p style={{ fontSize: "0.72rem", color: "var(--high)", marginTop: "0.4rem" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
