"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { spaceListSubtitle } from "@/lib/integrations/webex/space-display";
import { useWebexSpaces, type WebexSpaceListItem } from "@/components/use-webex-spaces";

interface AllowlistEntry {
  id: string;
  spaceId: string;
  spaceTitle: string | null;
  technologyLabel?: string | null;
}

const SUGGESTED_LABELS = [
  "Networking",
  "Security",
  "Collaboration",
  "Compute",
  "Observability",
  "GTM",
  "Support",
];

export function WebexTechnologySpacePicker({
  policyStatus,
}: {
  policyStatus: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { allSpaces, spaces, totalFetched, truncated, loading, error: spacesError } =
    useWebexSpaces(query);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [labelDraft, setLabelDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState(policyStatus);

  const allowlistedIds = new Set(allowlist.map((a) => a.spaceId));
  const displayError = error ?? spacesError;

  const loadAllowlist = useCallback(async () => {
    const res = await fetch("/api/integrations/webex/allowlist?purpose=TECHNOLOGY");
    if (!res.ok) return;
    const data = await res.json();
    setAllowlist(data.allowlist ?? []);
    if (data.status) setStatus(data.status);
  }, []);

  useEffect(() => {
    loadAllowlist();
  }, [loadAllowlist]);

  async function toggleSpace(space: WebexSpaceListItem) {
    setBusyId(space.id);
    const isListed = allowlistedIds.has(space.id);
    const res = await fetch("/api/integrations/webex/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId: space.id,
        spaceTitle: space.title,
        action: isListed ? "remove" : "add",
        purpose: "TECHNOLOGY",
        technologyLabel: labelDraft.trim() || undefined,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update technology spaces");
      return;
    }
    await loadAllowlist();
    router.refresh();
  }

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Technology spaces</h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Policy: {status} · Mapped: {allowlist.length}
          {totalFetched > 0 ? ` · ${totalFetched} Webex spaces loaded` : ""}
        </span>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.75rem", lineHeight: 1.5 }}>
        Map additional Webex spaces about products, support, or GTM. Summaries feed the
        Technology Updates view — separate from My Priorities.
        {truncated ? " Use search if you do not see a space below." : ""}
      </p>

      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
        Technology label (optional, applied when adding a space)
      </label>
      <input
        type="text"
        placeholder="e.g. Networking, Security, GTM"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        list="technology-label-suggestions"
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          color: "var(--text)",
          fontSize: "0.875rem",
          marginBottom: "0.75rem",
        }}
      />
      <datalist id="technology-label-suggestions">
        {SUGGESTED_LABELS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {displayError && (
        <p style={{ color: "var(--critical)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          {displayError}
        </p>
      )}

      {allowlist.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
            Mapped spaces
          </p>
          <ul
            style={{
              listStyle: "none",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {allowlist.map((entry) => (
              <li
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  borderBottom: "1px solid var(--border)",
                  background: "rgba(91, 156, 239, 0.08)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.spaceTitle ?? entry.spaceId}
                  </p>
                  {entry.technologyLabel && (
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {entry.technologyLabel}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    toggleSpace({
                      id: entry.spaceId,
                      title: entry.spaceTitle ?? entry.spaceId,
                      type: "space",
                    })
                  }
                  disabled={busyId === entry.spaceId}
                  style={{
                    flexShrink: 0,
                    background: "transparent",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    padding: "0.35rem 0.75rem",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    opacity: busyId === entry.spaceId ? 0.6 : 1,
                  }}
                >
                  {busyId === entry.spaceId ? "…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        type="search"
        placeholder="Filter spaces by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          color: "var(--text)",
          fontSize: "0.875rem",
          marginBottom: "0.75rem",
        }}
      />

      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading spaces…</p>
      ) : spaces.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No spaces found.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          {spaces.map((space) => {
            const selected = allowlistedIds.has(space.id);
            return (
              <li
                key={space.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.625rem 0.75rem",
                  borderBottom: "1px solid var(--border)",
                  background: selected ? "rgba(91, 156, 239, 0.08)" : "transparent",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {space.title}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {spaceListSubtitle(space, allSpaces)}
                  </p>
                </div>
                <button
                  onClick={() => toggleSpace(space)}
                  disabled={busyId === space.id}
                  style={{
                    flexShrink: 0,
                    background: selected ? "transparent" : "var(--accent)",
                    color: selected ? "var(--text-muted)" : "#fff",
                    border: selected ? "1px solid var(--border)" : "none",
                    padding: "0.35rem 0.75rem",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    opacity: busyId === space.id ? 0.6 : 1,
                  }}
                >
                  {busyId === space.id ? "…" : selected ? "Remove" : "Map"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
