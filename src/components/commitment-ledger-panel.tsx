"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommitmentLedgerItem } from "@/lib/commitments/sync";
import {
  commitmentOwnerLabel,
  commitmentSourceLabel,
} from "@/lib/heuristics/commitments";
import { formatRelativeAge } from "@/components/dashboard-ui";

interface CommitmentLedgerPanelProps {
  commitments: CommitmentLedgerItem[];
}

export function CommitmentLedgerPanel({ commitments }: CommitmentLedgerPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(id: string, status: "FULFILLED" | "DISMISSED") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/commitments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update commitment");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update commitment");
    } finally {
      setBusyId(null);
    }
  }

  if (commitments.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
        No open commitments tracked yet. They appear from partner asks, meeting action
        items, and your next steps after sync.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p style={{ color: "var(--critical)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          {error}
        </p>
      ) : null}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.65rem",
        }}
      >
        {commitments.map((item) => {
          const content = (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  marginBottom: "0.3rem",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color:
                      item.owner === "ME"
                        ? "var(--high)"
                        : item.owner === "PARTNER"
                          ? "var(--medium)"
                          : "var(--text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  {commitmentOwnerLabel(item.owner)}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {commitmentSourceLabel(item.source)} · {formatRelativeAge(item.updatedAt)}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", lineHeight: 1.5, margin: 0 }}>
                {item.title}
              </p>
              {item.ownerHint ? (
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                    marginBottom: 0,
                  }}
                >
                  {item.ownerHint}
                </p>
              ) : null}
            </>
          );

          return (
            <li
              key={item.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "0.75rem 0.85rem",
                background: "var(--surface)",
              }}
            >
              {item.communicationId ? (
                <Link
                  href={`/dashboard/${item.communicationId}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
                >
                  {content}
                </Link>
              ) : (
                content
              )}
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.55rem" }}>
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "FULFILLED")}
                  disabled={busyId === item.id}
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.25rem 0.55rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    opacity: busyId === item.id ? 0.6 : 1,
                  }}
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "DISMISSED")}
                  disabled={busyId === item.id}
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.25rem 0.55rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    opacity: busyId === item.id ? 0.6 : 1,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
