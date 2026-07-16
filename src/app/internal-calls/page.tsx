import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  internalCallReplayPlatform,
  internalCallReplayUrl,
  isInternalCallCommunication,
  viewerAttendedInternalCall,
  type InternalCallMetadata,
} from "@/lib/communications/internal-call";
import { replaySummaryLabel } from "@/lib/integrations/internal-calls/replay-enrich";
import { internalCallTypeLabel } from "@/lib/integrations/gong/internal-calls";
import { CardAiSummary } from "@/components/card-ai-summary";
import { WatchReplayButton } from "@/components/watch-replay-button";
import { formatRelativeAge } from "@/components/dashboard-ui";
import { prisma } from "@/lib/db";
import type { InternalCallType } from "@/lib/integrations/gong/internal-calls";
import { scopedToTenant } from "@/lib/tenant";

const LOOKBACK_DAYS = 60;

const TYPE_ORDER: InternalCallType[] = [
  "all-hands",
  "town-hall",
  "technology-call",
  "enablement",
];

interface InternalCallEntry {
  id: string;
  subject: string | null;
  receivedAt: Date;
  source: string;
  tags: string[];
  metadata: InternalCallMetadata;
  summaryText: string | null;
}

function resolveInternalCallType(entry: InternalCallEntry): InternalCallType {
  if (entry.metadata.internalCallType) {
    return entry.metadata.internalCallType;
  }

  const tagMatch = entry.tags.find((tag): tag is InternalCallType =>
    TYPE_ORDER.includes(tag as InternalCallType)
  );
  return tagMatch ?? "technology-call";
}

function resolveSummaryLabel(entry: InternalCallEntry): string {
  if (entry.metadata.replaySummarySource) {
    return replaySummaryLabel(entry.metadata.replaySummarySource);
  }
  if (entry.metadata.fromGongEmail || entry.tags.includes("gong-summary")) {
    return "Gong AI";
  }
  return "Summary";
}

function resolveSummarySource(entry: InternalCallEntry): "gong" | null {
  if (entry.metadata.fromReplayEmail) return null;
  if (entry.metadata.fromGongEmail || entry.tags.includes("gong-summary")) {
    return "gong";
  }
  return null;
}

function replayPlatformLabel(platform: string | null): string | null {
  if (!platform) return null;
  switch (platform) {
    case "gong":
      return "Gong";
    case "webex":
      return "Webex";
    case "zoom":
      return "Zoom";
    case "stream":
      return "Microsoft Stream";
    case "sharepoint":
      return "SharePoint";
    case "cisco":
      return "Cisco";
    case "vidcast":
      return "Vidcast";
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    default:
      return platform;
  }
}

function resolveSummaryText(entry: InternalCallEntry): string | null {
  return entry.metadata.gongSummaryText?.trim() || entry.summaryText?.trim() || null;
}

export default async function InternalCallsPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const tenantWhere = scopedToTenant(session.tenantId);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const userEmail = session.email.toLowerCase();

  const raw = await prisma.communication
    .findMany({
      where: {
        ...tenantWhere,
        receivedAt: { gte: since },
        OR: [
          { tags: { has: "internal-call" } },
          { tags: { has: "gong-summary" } },
          { source: "WEBEX_MEETING" },
        ],
      },
      orderBy: { receivedAt: "desc" },
      take: 120,
      select: {
        id: true,
        subject: true,
        receivedAt: true,
        source: true,
        tags: true,
        metadata: true,
        summary: true,
        excerpt: true,
      },
    })
    .catch(() => []);

  const calls: InternalCallEntry[] = raw
    .filter((item) =>
      isInternalCallCommunication(item.source, item.subject, item.tags, item.metadata)
    )
    .map((item) => ({
      id: item.id,
      subject: item.subject,
      receivedAt: item.receivedAt,
      source: item.source,
      tags: item.tags,
      metadata: (item.metadata ?? {}) as InternalCallMetadata,
      summaryText:
        ((item.metadata ?? {}) as InternalCallMetadata).gongSummaryText ??
        item.summary ??
        item.excerpt,
    }))
    .filter((item) => resolveSummaryText(item) || internalCallReplayUrl(item.metadata));

  const grouped = new Map<InternalCallType, InternalCallEntry[]>();
  for (const type of TYPE_ORDER) {
    grouped.set(type, []);
  }

  for (const call of calls) {
    const type = resolveInternalCallType(call);
    const list = grouped.get(type) ?? [];
    list.push(call);
    grouped.set(type, list);
  }

  const totalCalls = calls.length;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Internal Calls</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.5 }}>
          All hands, town halls, technology calls, and enablement replays from Gong recaps
          and replay notification emails — whether or not you attended.
        </p>
      </header>

      {totalCalls === 0 ? (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            No internal call replays yet. Replay emails are pulled from your connected
            Microsoft 365 mailbox (personal inbox) and Apple Mail when enabled. Visit this
            page again after syncing email, or run ingestion from Settings.
          </p>
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {TYPE_ORDER.map((type) => {
            const entries = grouped.get(type) ?? [];
            if (entries.length === 0) return null;

            return (
              <section
                key={type}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.25rem",
                }}
              >
                <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  {internalCallTypeLabel(type)}
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontWeight: 400,
                      marginLeft: "0.5rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    ({entries.length})
                  </span>
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    marginBottom: "1rem",
                  }}
                >
                  {type === "all-hands" || type === "town-hall"
                    ? "Company-wide updates you may have missed."
                    : type === "technology-call"
                      ? "Product and architecture discussions across the portfolio."
                      : "Training, brown bags, and skill-building sessions."}
                </p>

                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  {entries.map((call) => {
                    const summary = resolveSummaryText(call);
                    const replayUrl = internalCallReplayUrl(call.metadata);
                    const replayPlatform = replayPlatformLabel(
                      internalCallReplayPlatform(call.metadata)
                    );
                    const attended = viewerAttendedInternalCall(call.metadata, userEmail);
                    const sourceBadge = call.metadata.fromReplayEmail
                      ? "Replay email"
                      : call.metadata.fromGongEmail || call.tags.includes("gong-summary")
                        ? "Gong recap"
                        : null;

                    return (
                      <li
                        key={call.id}
                        style={{
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "1rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            marginBottom: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                color: "var(--medium)",
                                textTransform: "uppercase",
                              }}
                            >
                              {call.metadata.internalCallLabel ??
                                internalCallTypeLabel(resolveInternalCallType(call))}
                            </span>
                            {attended === true ? (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "var(--low)",
                                  textTransform: "uppercase",
                                }}
                              >
                                You attended
                              </span>
                            ) : attended === false ? (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "var(--accent)",
                                  textTransform: "uppercase",
                                }}
                              >
                                Replay available
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "var(--text-muted)",
                                  textTransform: "uppercase",
                                }}
                              >
                                {sourceBadge ?? "Internal call"}
                              </span>
                            )}
                            {replayPlatform ? (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "var(--text-muted)",
                                  textTransform: "uppercase",
                                }}
                              >
                                {replayPlatform}
                              </span>
                            ) : null}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {formatRelativeAge(call.receivedAt)}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "0.75rem",
                            marginTop: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <Link
                            href={`/dashboard/${call.id}`}
                            style={{
                              textDecoration: "none",
                              color: "inherit",
                              flex: "1 1 220px",
                              minWidth: 0,
                            }}
                          >
                            <p style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.4 }}>
                              {call.metadata.gongMeetingTitle ?? call.subject ?? "Internal call"}
                            </p>
                          </Link>
                          {replayUrl ? (
                            <WatchReplayButton
                              url={replayUrl}
                              platform={replayPlatform}
                            />
                          ) : null}
                        </div>

                        {summary ? (
                          <CardAiSummary
                            text={summary}
                            label={resolveSummaryLabel(call)}
                            source={resolveSummarySource(call)}
                            maxBullets={5}
                          />
                        ) : (
                          <p
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--text-muted)",
                              marginTop: "0.35rem",
                            }}
                          >
                            Summary not available — open the replay for details.
                          </p>
                        )}

                        {call.metadata.gongActionItems &&
                        call.metadata.gongActionItems.length > 0 ? (
                          <ul
                            style={{
                              marginTop: "0.55rem",
                              marginBottom: 0,
                              paddingLeft: "1.1rem",
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                              lineHeight: 1.5,
                            }}
                          >
                            {call.metadata.gongActionItems.slice(0, 3).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}

                        <div
                          style={{
                            marginTop: "0.65rem",
                          }}
                        >
                          <Link
                            href={`/dashboard/${call.id}`}
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--accent)",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            View details →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
