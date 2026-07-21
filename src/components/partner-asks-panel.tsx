import Link from "next/link";
import type { PartnerAskItem } from "@/lib/heuristics/partner-asks";
import type { StaleSlaInfo } from "@/lib/heuristics/stale-sla";
import { formatRelativeAge } from "@/components/dashboard-ui";
import { StaleSlaBadge } from "@/components/stale-sla-badge";

export type PartnerAskWithSla = PartnerAskItem & { sla: StaleSlaInfo };

interface PartnerAsksPanelProps {
  asks: PartnerAskWithSla[];
}

export function PartnerAsksPanel({ asks }: PartnerAsksPanelProps) {
  if (asks.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
        No open partner asks detected in recent communications.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {asks.map((item) => (
        <li key={item.communicationId}>
          <Link
            href={`/dashboard/${item.communicationId}`}
            style={{
              display: "block",
              padding: "0.75rem 0.85rem",
              borderRadius: 10,
              border:
                item.sla.severity === "critical"
                  ? "1px solid var(--critical)"
                  : item.sla.severity === "warning"
                    ? "1px solid var(--high)"
                    : "1px solid var(--border)",
              textDecoration: "none",
              color: "inherit",
              background:
                item.sla.severity === "critical"
                  ? "rgba(220, 80, 80, 0.06)"
                  : item.sla.severity === "warning"
                    ? "rgba(232, 197, 91, 0.08)"
                    : "transparent",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: "0.35rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <StaleSlaBadge sla={item.sla} />
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {formatRelativeAge(item.receivedAt)}
              </span>
            </div>
            <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              {item.subject ?? "Partner communication"}
            </p>
            <p
              className="line-clamp-2"
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {item.ask}
            </p>
            {item.authorName ? (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: "0.35rem",
                  marginBottom: 0,
                }}
              >
                From {item.authorName}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
