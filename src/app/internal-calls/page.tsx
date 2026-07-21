import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  isInternalCallCommunication,
  resolveInternalCallReplay,
  viewerAttendedInternalCall,
  type InternalCallMetadata,
} from "@/lib/communications/internal-call";
import { replaySummaryLabel } from "@/lib/integrations/internal-calls/replay-enrich";
import { internalCallTypeLabel } from "@/lib/integrations/gong/internal-calls";
import {
  resolveUnifiedMeetingSummary,
  type UnifiedMeetingMetadata,
} from "@/lib/integrations/meetings/unify";
import { CardAiSummary } from "@/components/card-ai-summary";
import { WatchReplayButton } from "@/components/watch-replay-button";
import { formatRelativeAge, MetaChip } from "@/components/dashboard-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection, PageShell } from "@/components/ui/page-shell";
import { Panel } from "@/components/ui/panel";
import { UserMeetingsPanel } from "@/components/user-meetings-panel";
import { prisma } from "@/lib/db";
import type { InternalCallType } from "@/lib/integrations/gong/internal-calls";
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
  excerpt: string | null;
  bodyText: string | null;
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

function resolveSummaryText(entry: InternalCallEntry): string | null {
  if (entry.source === "WEBEX_MEETING") {
    const unified = resolveUnifiedMeetingSummary(
      entry.metadata as UnifiedMeetingMetadata,
      entry.summaryText
    );
    if (unified?.text) return unified.text;
  }

  return entry.metadata.gongSummaryText?.trim() || entry.summaryText?.trim() || null;
}

function resolveSummarySource(entry: InternalCallEntry): "gong" | "transcript" | null {
  if (entry.source === "WEBEX_MEETING") {
    const unified = resolveUnifiedMeetingSummary(
      entry.metadata as UnifiedMeetingMetadata,
      entry.summaryText
    );
    if (unified?.source === "gong") return "gong";
  }

  if (entry.metadata.replaySummarySource === "transcript") {
    return "transcript";
  }
  if (entry.metadata.fromReplayEmail) return null;
  if (
    entry.metadata.gongSummaryText?.trim() ||
    entry.metadata.fromGongEmail ||
    entry.tags.includes("gong-summary")
  ) {
    return "gong";
  }
  return null;
}

function resolveSummaryLabel(entry: InternalCallEntry): string {
  if (entry.source === "WEBEX_MEETING") {
    const unified = resolveUnifiedMeetingSummary(
      entry.metadata as UnifiedMeetingMetadata,
      entry.summaryText
    );
    if (unified?.label) return unified.label;
  }

  if (entry.metadata.replaySummarySource) {
    return replaySummaryLabel(entry.metadata.replaySummarySource);
  }
  if (entry.metadata.fromGongEmail || entry.tags.includes("gong-summary")) {
    return "Gong AI";
  }
  return "Summary";
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

export default async function InternalCallsPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const tenantWhere = {};
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const userEmail = session.email.toLowerCase();

  const raw = await prisma.communication
    .findMany({
      where: {
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
        body: true,
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
      excerpt: item.excerpt,
      bodyText: item.body,
    }))
    .filter(
      (item) =>
        resolveSummaryText(item) ||
        resolveInternalCallReplay(item.metadata, item.bodyText, item.excerpt, item.summaryText)
          .url
    );

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
  let allowOllamaSummaries = false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { allowOllamaSummaries: true },
    });
    allowOllamaSummaries = user?.allowOllamaSummaries ?? false;
  } catch {
    allowOllamaSummaries = false;
  }

  const viewerMention = {
    id: session.userId,
    name: session.name ?? null,
    email: session.email,
  };

  return (
    <PageShell
      title="Meeting Summaries"
      description="Company replays, town halls, and enablement sessions — plus Webex meetings you joined."
      width="wide"
    >
      <UserMeetingsPanel
        userId={session.userId}
        userEmail={userEmail}
        viewer={viewerMention}
        allowOllamaSummaries={allowOllamaSummaries}
      />

      {totalCalls === 0 ? (
        <PageSection>
          <div className="panel">
            <EmptyState message="No internal call replays yet. Replay emails are pulled from Apple Mail (when enabled) or from file import on the ingestion settings page. Visit this page again after syncing, or run ingestion from Settings." />
          </div>
        </PageSection>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {TYPE_ORDER.map((type) => {
            const entries = grouped.get(type) ?? [];
            if (entries.length === 0) return null;

            return (
              <Panel key={type} title={internalCallTypeLabel(type)} count={entries.length}>
                <p className="text-sm text-muted" style={{ marginBottom: "var(--space-4)" }}>
                  {type === "all-hands" || type === "town-hall"
                    ? "Company-wide updates you may have missed."
                    : type === "technology-call"
                      ? "Product and architecture discussions across the portfolio."
                      : "Training, brown bags, and skill-building sessions."}
                </p>

                <ul className="list-stack">
                  {entries.map((call) => {
                    const summary = resolveSummaryText(call);
                    const replay = resolveInternalCallReplay(
                      call.metadata,
                      call.bodyText,
                      call.excerpt,
                      call.summaryText
                    );
                    const replayUrl = replay.url;
                    const replayPlatform = replayPlatformLabel(replay.platform);
                    const attended = viewerAttendedInternalCall(call.metadata, userEmail);
                    const sourceBadge = call.metadata.fromReplayEmail
                      ? "Replay email"
                      : call.metadata.fromGongEmail || call.tags.includes("gong-summary")
                        ? "Gong recap"
                        : null;

                    return (
                      <li key={call.id} className="card-item">
                        <div className="card__meta">
                          <div className="card__meta-start">
                            <MetaChip
                              label={
                                call.metadata.internalCallLabel ??
                                internalCallTypeLabel(resolveInternalCallType(call))
                              }
                              variant="medium"
                            />
                            {attended === true ? (
                              <MetaChip label="You attended" variant="low" />
                            ) : attended === false ? (
                              <MetaChip label="Replay available" variant="accent" />
                            ) : sourceBadge ? (
                              <MetaChip label={sourceBadge} variant="default" />
                            ) : null}
                            {replayPlatform ? (
                              <MetaChip label={replayPlatform} variant="default" />
                            ) : null}
                          </div>
                          <span className="card__timestamp">{formatRelativeAge(call.receivedAt)}</span>
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
                            <p className="card__title">
                              {call.metadata.gongMeetingTitle ?? call.subject ?? "Internal call"}
                            </p>
                          </Link>
                          {replayUrl ? (
                            <WatchReplayButton url={replayUrl} platform={replayPlatform} />
                          ) : null}
                        </div>

                        {summary ? (
                          <CardAiSummary
                            text={summary}
                            label={resolveSummaryLabel(call)}
                            source={resolveSummarySource(call)}
                            variant="full"
                            showAllTakeaways
                          />
                        ) : (
                          <p className="text-sm text-muted" style={{ marginTop: "0.35rem" }}>
                            Summary not available — open the replay for details.
                          </p>
                        )}

                        <div style={{ marginTop: "0.65rem" }}>
                          <Link href={`/dashboard/${call.id}`} className="text-xs" style={{ fontWeight: 500 }}>
                            View details →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
