"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PriorityBadge } from "@/components/dashboard-ui";

interface PreviewResult {
  title: string;
  summary: string;
  priority: string;
  priorityReasons: string[];
  dueAt: string | null;
  suggestedAction: string | null;
}

export function AddManualNextStep() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    const trimmed = details.trim();
    if (trimmed.length < 10) {
      setError("Paste at least a sentence or two of context.");
      setPreview(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/next-steps/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: trimmed, preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not parse details");
        setPreview(null);
        return;
      }
      setPreview(data.preview ?? null);
    } catch {
      setError("Could not parse details");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function createStep() {
    const trimmed = details.trim();
    if (trimmed.length < 10 || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/next-steps/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create next step");
        return;
      }

      setDetails("");
      setPreview(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not create next step");
    } finally {
      setLoading(false);
    }
  }

  function formatDueDate(iso: string | null): string | null {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            padding: "0.55rem 0.75rem",
            color: "var(--accent)",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + Add next step
        </button>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.75rem",
            background: "var(--bg)",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
              lineHeight: 1.5,
            }}
          >
            Paste email text, a CFP notice, or any notes — we&apos;ll extract a
            title, summary, priority, and due date.
          </p>
          <textarea
            value={details}
            onChange={(event) => {
              setDetails(event.target.value);
              setPreview(null);
              setError(null);
            }}
            placeholder={`Example:\nCFP for Cisco Live 2026 — Security track\nSubmit 400-word abstract and speaker bio.\nSubmission deadline August 4th.`}
            rows={6}
            style={{
              width: "100%",
              resize: "vertical",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.65rem 0.75rem",
              color: "var(--text)",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              marginBottom: "0.5rem",
            }}
          />

          {error ? (
            <p
              style={{
                color: "var(--critical)",
                fontSize: "0.75rem",
                marginBottom: "0.5rem",
              }}
            >
              {error}
            </p>
          ) : null}

          {preview ? (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.65rem 0.75rem",
                marginBottom: "0.5rem",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.35rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Preview
                </span>
                <PriorityBadge priority={preview.priority} />
                {preview.dueAt ? (
                  <span style={{ fontSize: "0.72rem", color: "var(--medium)" }}>
                    Due {formatDueDate(preview.dueAt)}
                  </span>
                ) : null}
              </div>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                {preview.title}
              </p>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview.summary}
              </p>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={loading || details.trim().length < 10}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.4rem 0.75rem",
                fontSize: "0.75rem",
                color: "var(--text)",
                cursor: loading ? "wait" : "pointer",
                opacity: details.trim().length < 10 ? 0.6 : 1,
              }}
            >
              {loading && !preview ? "Parsing…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={() => void createStep()}
              disabled={loading || details.trim().length < 10}
              style={{
                background: "var(--accent)",
                border: "none",
                borderRadius: 6,
                padding: "0.4rem 0.75rem",
                fontSize: "0.75rem",
                color: "#fff",
                fontWeight: 500,
                cursor: loading ? "wait" : "pointer",
                opacity: details.trim().length < 10 ? 0.6 : 1,
              }}
            >
              {loading && preview ? "Adding…" : "Add to stack"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDetails("");
                setPreview(null);
                setError(null);
              }}
              disabled={loading}
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 6,
                padding: "0.4rem 0.75rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
