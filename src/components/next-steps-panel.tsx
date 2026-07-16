"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CardAiSummary } from "@/components/card-ai-summary";

export interface NextStepCardItem {
  id: string;
  headline: string;
  meta: string;
  communicationId: string | null;
  summaryText?: string | null;
  summaryLabel?: string | null;
  summarySource?: string | null;
}

interface NextStepsPanelProps {
  steps: NextStepCardItem[];
}

const DRAG_DATA_KEY = "application/x-next-step-id";

export function NextStepsPanel({ steps: initialSteps }: NextStepsPanelProps) {
  const [steps, setSteps] = useState(initialSteps);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  async function persistOrder(orderedIds: string[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/next-steps/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? "Could not save order");
      }
    } catch {
      setSaveError("Could not save order");
    } finally {
      setSaving(false);
    }
  }

  function reorder(dragId: string, targetId: string) {
    if (dragId === targetId) return;

    const fromIndex = steps.findIndex((step) => step.id === dragId);
    const toIndex = steps.findIndex((step) => step.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSteps(next);
    void persistOrder(next.map((step) => step.id));
  }

  function clearDragState() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  }

  if (steps.length === 0) {
    return null;
  }

  return (
    <>
      {saving ? (
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            marginBottom: "0.5rem",
          }}
        >
          Saving order…
        </p>
      ) : null}
      {saveError ? (
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--high)",
            marginBottom: "0.5rem",
          }}
        >
          {saveError}
        </p>
      ) : null}
      <ul
        style={{
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {steps.map((step) => {
          const isDragging = draggingId === step.id;
          const isDropTarget = dropTargetId === step.id && draggingId !== step.id;

          const cardBody = (
            <>
              {step.summaryText ? (
                <>
                  {step.headline ? (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        marginBottom: "0.35rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {step.headline}
                    </p>
                  ) : null}
                  <CardAiSummary
                    text={step.summaryText}
                    label={step.summaryLabel}
                    source={step.summarySource}
                    maxBullets={4}
                  />
                </>
              ) : (
                <p style={{ fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.45 }}>
                  {step.headline}
                </p>
              )}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {step.meta}
              </span>
            </>
          );

          return (
            <li
              key={step.id}
              data-step-id={step.id}
              onDragEnter={(event) => {
                event.preventDefault();
                const dragId = draggingIdRef.current;
                if (dragId && dragId !== step.id) {
                  setDropTargetId(step.id);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const dragId = draggingIdRef.current;
                if (dragId && dragId !== step.id) {
                  setDropTargetId(step.id);
                }
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) {
                  return;
                }
                if (dropTargetId === step.id) {
                  setDropTargetId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const dragId =
                  event.dataTransfer.getData(DRAG_DATA_KEY) ||
                  draggingIdRef.current;
                if (dragId && dragId !== step.id) {
                  reorder(dragId, step.id);
                }
                clearDragState();
              }}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "stretch",
                padding: "0.75rem",
                background: isDropTarget ? "rgba(232, 197, 91, 0.1)" : "var(--bg)",
                borderRadius: 8,
                border: isDropTarget
                  ? "1px solid var(--medium)"
                  : "1px solid var(--border)",
                opacity: isDragging ? 0.55 : 1,
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
            >
              <button
                type="button"
                draggable
                aria-label={`Reorder ${step.headline}`}
                onDragStart={(event) => {
                  event.stopPropagation();
                  draggingIdRef.current = step.id;
                  setDraggingId(step.id);
                  event.dataTransfer.setData(DRAG_DATA_KEY, step.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearDragState();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                style={{
                  flexShrink: 0,
                  alignSelf: "center",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: draggingId ? "grabbing" : "grab",
                  fontSize: "0.95rem",
                  lineHeight: 1,
                  padding: "0.15rem 0.1rem",
                  touchAction: "none",
                  userSelect: "none",
                }}
              >
                ⠿
              </button>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  pointerEvents: draggingId ? "none" : "auto",
                }}
              >
                {step.communicationId ? (
                  <Link
                    href={`/dashboard/${step.communicationId}`}
                    className="dashboard-card-link"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {cardBody}
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "0.35rem",
                        fontSize: "0.72rem",
                        color: "var(--accent)",
                        fontWeight: 500,
                      }}
                    >
                      View source →
                    </span>
                  </Link>
                ) : (
                  cardBody
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
