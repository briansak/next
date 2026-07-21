import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isTechnologyCommunication } from "@/lib/communications/space-purpose";
import {
  isProductAnnouncementCommunication,
  productAnnouncementLabel,
  productAnnouncementSummary,
  productAnnouncementTitle,
  type ProductAnnouncementMetadata,
} from "@/lib/communications/product-announcement";
import { viewerIsMentioned } from "@/lib/heuristics/mentions";
import { CardAiSummary } from "@/components/card-ai-summary";
import { DashboardCardLink } from "@/components/dashboard-card-link";
import { formatRelativeAge } from "@/components/dashboard-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection, PageShell } from "@/components/ui/page-shell";
import { Panel } from "@/components/ui/panel";
import {
  resolveTechnologySpaceFaq,
  type TechnologyThreadMessage,
} from "@/lib/heuristics/technology-faq";
import {
  resolveTechnologySpaceSummary,
  type TechnologyMessage,
} from "@/lib/heuristics/technology-summary";
interface CommunicationMetadata {
  mentionedUserIds?: string[];
  roomId?: string;
  parentId?: string;
  spaceTitle?: string;
  technologyLabel?: string;
  spacePurpose?: string;
}

interface MappedSpace {
  id: string;
  spaceId: string;
  spaceTitle: string | null;
  technologyLabel: string | null;
  technologySummaryCache: unknown;
  technologyFaqCache: unknown;
}

const LOOKBACK_DAYS = 14;
const ANNOUNCEMENT_LOOKBACK_DAYS = 45;

interface ProductAnnouncementEntry {
  id: string;
  subject: string | null;
  receivedAt: Date;
  metadata: ProductAnnouncementMetadata;
  summaryText: string;
  technologyLabel: string;
  title: string;
}

export default async function TechnologiesPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/setup");
  }

  const tenantWhere = {};
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const announcementSince = new Date(
    Date.now() - ANNOUNCEMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const webexPolicy = await prisma.ingestionPolicy.findFirst({
    where: { source: "WEBEX" },
    include: {
      webexAllowlists: {
        where: { purpose: "TECHNOLOGY" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const mappedSpaces: MappedSpace[] = webexPolicy?.webexAllowlists ?? [];

  const rawMessages = mappedSpaces.length
    ? await prisma.communication.findMany({
        where: {
          source: "WEBEX",
          receivedAt: { gte: since },
        },
        orderBy: { receivedAt: "desc" },
        take: 500,
      })
    : [];

  const technologyMessages = rawMessages.filter((message) =>
    isTechnologyCommunication(message.metadata)
  );

  const announcementRows = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      receivedAt: { gte: announcementSince },
      tags: { has: "product-announcement" },
    },
    orderBy: { receivedAt: "desc" },
    take: 40,
    select: {
      id: true,
      subject: true,
      receivedAt: true,
      tags: true,
      metadata: true,
      summary: true,
      excerpt: true,
    },
  });

  const productAnnouncements: ProductAnnouncementEntry[] = announcementRows
    .filter((row) => isProductAnnouncementCommunication(row.tags, row.metadata))
    .map((row) => {
      const metadata = (row.metadata ?? {}) as ProductAnnouncementMetadata;
      return {
        id: row.id,
        subject: row.subject,
        receivedAt: row.receivedAt,
        metadata,
        summaryText:
          productAnnouncementSummary(metadata) ??
          row.summary ??
          row.excerpt ??
          row.subject ??
          "",
        technologyLabel: productAnnouncementLabel(metadata),
        title: productAnnouncementTitle(row.subject, metadata),
      };
    })
    .filter((entry) => entry.summaryText.trim().length > 0);

  const announcementsByLabel = new Map<string, ProductAnnouncementEntry[]>();
  for (const entry of productAnnouncements) {
    const bucket = announcementsByLabel.get(entry.technologyLabel) ?? [];
    bucket.push(entry);
    announcementsByLabel.set(entry.technologyLabel, bucket);
  }

  const messagesBySpace = new Map<string, typeof technologyMessages>();
  for (const message of technologyMessages) {
    const meta = (message.metadata ?? {}) as CommunicationMetadata;
    const roomId = meta.roomId;
    if (!roomId) continue;
    const bucket = messagesBySpace.get(roomId) ?? [];
    bucket.push(message);
    messagesBySpace.set(roomId, bucket);
  }

  const viewerMention = {
    id: session.userId,
    name: session.name ?? null,
    email: session.email,
  };

  const directedToYou = technologyMessages
    .filter((message) => {
      const meta = (message.metadata ?? {}) as CommunicationMetadata;
      return viewerIsMentioned(meta.mentionedUserIds, session.userId, {
        text: message.body,
        viewer: viewerMention,
      });
    })
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, 12);

  const spaceSummaries = await Promise.all(
    mappedSpaces.map(async (space) => {
      const messages = messagesBySpace.get(space.spaceId) ?? [];
      const summary = await resolveTechnologySpaceSummary({
        allowlistId: space.id,
        spaceTitle: space.spaceTitle ?? "Technology space",
        technologyLabel: space.technologyLabel,
        messages: messages.map(toTechnologyMessage),
        cache: space.technologySummaryCache,
        allowOllama: false,
        persistCache: async (cache) => {
          await prisma.webexSpaceAllowlist.update({
            where: { id: space.id },
            data: { technologySummaryCache: cache },
          });
        },
      });

      const faq = await resolveTechnologySpaceFaq({
        spaceTitle: space.spaceTitle ?? "Technology space",
        technologyLabel: space.technologyLabel,
        messages: messages.map((message) =>
          toTechnologyThreadMessage(message, space.spaceId)
        ),
        cache: space.technologyFaqCache,
        allowOllama: false,
        persistCache: async (cache) => {
          await prisma.webexSpaceAllowlist.update({
            where: { id: space.id },
            data: { technologyFaqCache: cache },
          });
        },
      });

      const recentMessages = messages.slice(0, 5);

      return {
        space,
        summary,
        faq,
        recentMessages,
        messageCount: messages.length,
      };
    })
  );

  const groupedByLabel = new Map<string, typeof spaceSummaries>();
  for (const entry of spaceSummaries) {
    const label = entry.space.technologyLabel?.trim() || "General";
    const bucket = groupedByLabel.get(label) ?? [];
    bucket.push(entry);
    groupedByLabel.set(label, bucket);
  }

  return (
    <PageShell
      title="Technology Updates"
      description="Product release emails plus compressed summaries and thread-based FAQs from product, support, and GTM spaces — catch up quickly without reading every message."
      width="wide"
    >
      {productAnnouncements.length > 0 && (
        <PageSection>
          <Panel title="Product announcements" count={productAnnouncements.length}>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              Vendor release and launch emails distilled into scannable summaries — last{" "}
              {ANNOUNCEMENT_LOOKBACK_DAYS} days.
            </p>
            {[...announcementsByLabel.entries()].map(([label, entries]) => (
              <div key={label} style={{ marginBottom: "1rem" }}>
                <p
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "var(--medium)",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                  }}
                >
                  {label}
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "1rem",
                        background: "var(--bg)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          marginBottom: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                          {entry.title}
                          {entry.metadata.productVersion ? (
                            <span
                              style={{
                                marginLeft: "0.5rem",
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                fontWeight: 500,
                              }}
                            >
                              v{entry.metadata.productVersion}
                            </span>
                          ) : null}
                        </h3>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatRelativeAge(entry.receivedAt)}
                          {entry.metadata.vendor ? ` · ${entry.metadata.vendor}` : ""}
                        </span>
                      </div>

                      <CardAiSummary
                        text={entry.summaryText}
                        label="Release summary"
                      />

                      <div
                        style={{
                          marginTop: "0.75rem",
                          display: "flex",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <DashboardCardLink id={entry.id}>
                          <span style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 500 }}>
                            View email
                          </span>
                        </DashboardCardLink>
                        {entry.metadata.learnMoreUrl ? (
                          <a
                            href={entry.metadata.learnMoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.8rem", color: "var(--accent)" }}
                          >
                            Learn more
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        </PageSection>
      )}

      {mappedSpaces.length === 0 && productAnnouncements.length === 0 ? (
        <PageSection>
          <div className="panel">
            <EmptyState message="No technology content yet. Product announcement emails are detected automatically from your connected mailbox. For Webex space summaries, map technology spaces in ingestion settings." />
            <p className="text-sm" style={{ marginTop: "0.75rem" }}>
              <Link href="/settings/webex">Open ingestion settings</Link>
            </p>
          </div>
        </PageSection>
      ) : mappedSpaces.length === 0 ? null : (
        <>
          {directedToYou.length > 0 && (
            <PageSection>
              <Panel title="Directed to you" count={directedToYou.length}>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    marginBottom: "1rem",
                    lineHeight: 1.5,
                  }}
                >
                  Messages where you were @mentioned — worth reading in full.
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {directedToYou.map((message) => {
                    const meta = (message.metadata ?? {}) as CommunicationMetadata;
                    return (
                      <li key={message.id}>
                        <DashboardCardLink id={message.id} highlighted>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "0.25rem",
                              gap: "0.5rem",
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
                                  color: "var(--accent)",
                                  textTransform: "uppercase",
                                }}
                              >
                                @you
                              </span>
                              {meta.technologyLabel && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    fontWeight: 600,
                                    color: "var(--medium)",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {meta.technologyLabel}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {formatRelativeAge(message.receivedAt)}
                            </span>
                          </div>
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                            {meta.spaceTitle ?? "Webex space"}
                            {message.authorName ? ` · ${message.authorName}` : ""}
                          </p>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                            {message.excerpt ?? message.body.slice(0, 160)}
                          </p>
                        </DashboardCardLink>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </PageSection>
          )}

          {[...groupedByLabel.entries()].map(([label, entries]) => (
            <PageSection key={label}>
              <Panel title={label} count={entries.length}>
                <ul
                  style={{
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {entries.map(({ space, summary, faq, recentMessages, messageCount }) => (
                    <li
                      key={space.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "1rem",
                        background: "var(--bg)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          marginBottom: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                          {space.spaceTitle ?? space.spaceId}
                        </h3>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {messageCount} message{messageCount === 1 ? "" : "s"} · last{" "}
                          {LOOKBACK_DAYS}d
                        </span>
                      </div>

                      <CardAiSummary
                        text={summary.text}
                        label="Discussion summary"
                      />

                      <div style={{ marginTop: "1rem" }}>
                        <p
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            color: "var(--accent)",
                            textTransform: "uppercase",
                            marginBottom: "0.5rem",
                          }}
                        >
                          Space FAQ
                          {faq.source === "ollama" ? " · AI generated" : ""}
                        </p>
                        {faq.entries.length === 0 ? (
                          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                            No answered threads yet. FAQs appear when someone asks a question
                            in a Webex thread and gets a reply — sync again after more discussion.
                          </p>
                        ) : (
                          <ul
                            style={{
                              listStyle: "none",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.75rem",
                            }}
                          >
                            {faq.entries.map((entry) => (
                              <li
                                key={`${entry.threadRootId ?? entry.question}`}
                                style={{
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "0.75rem",
                                  background: "var(--surface)",
                                }}
                              >
                                <p style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4 }}>
                                  {entry.question}
                                </p>
                                <p
                                  style={{
                                    fontSize: "0.85rem",
                                    color: "var(--text-muted)",
                                    marginTop: "0.35rem",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {entry.answer}
                                </p>
                                {entry.links.length > 0 && (
                                  <ul
                                    style={{
                                      listStyle: "none",
                                      marginTop: "0.5rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.25rem",
                                    }}
                                  >
                                    {entry.links.map((link) => (
                                      <li key={link}>
                                        <a
                                          href={link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            fontSize: "0.8rem",
                                            color: "var(--accent)",
                                            wordBreak: "break-all",
                                          }}
                                        >
                                          {link}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {summary.asks.length > 0 && (
                        <div style={{ marginTop: "0.75rem" }}>
                          <p
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "var(--accent)",
                              textTransform: "uppercase",
                              marginBottom: "0.35rem",
                            }}
                          >
                            Open questions
                          </p>
                          <ul style={{ paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
                            {summary.asks.map((ask) => (
                              <li key={ask} style={{ color: "var(--text-muted)" }}>
                                {ask}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary.responses.length > 0 && (
                        <div style={{ marginTop: "0.75rem" }}>
                          <p
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              marginBottom: "0.35rem",
                            }}
                          >
                            Responses & updates
                          </p>
                          <ul style={{ paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
                            {summary.responses.map((response) => (
                              <li key={response} style={{ color: "var(--text-muted)" }}>
                                {response}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary.themes.length > 0 && (
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                          Topics: {summary.themes.join(", ")}
                        </p>
                      )}

                      {recentMessages.length > 0 && (
                        <details style={{ marginTop: "0.85rem" }}>
                          <summary
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--accent)",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            Recent messages ({recentMessages.length})
                          </summary>
                          <ul
                            style={{
                              listStyle: "none",
                              marginTop: "0.5rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.5rem",
                            }}
                          >
                            {recentMessages.map((message) => (
                              <li key={message.id}>
                                <DashboardCardLink id={message.id}>
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    {formatRelativeAge(message.receivedAt)}
                                    {message.authorName ? ` · ${message.authorName}` : ""}
                                  </span>
                                  <p style={{ fontSize: "0.85rem", marginTop: "0.15rem" }}>
                                    {message.excerpt ?? message.body.slice(0, 140)}
                                  </p>
                                </DashboardCardLink>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            </PageSection>
          ))}
        </>
      )}
    </PageShell>
  );
}

function toTechnologyThreadMessage(
  message: {
    id: string;
    externalId: string;
    body: string;
    authorName: string | null;
    receivedAt: Date;
    threadId: string | null;
    metadata: unknown;
  },
  roomId: string
): TechnologyThreadMessage {
  const meta = (message.metadata ?? {}) as CommunicationMetadata;
  return {
    id: message.id,
    externalId: message.externalId,
    body: message.body,
    authorName: message.authorName,
    receivedAt: message.receivedAt,
    threadId: message.threadId,
    parentId: meta.parentId ?? null,
    roomId: meta.roomId ?? roomId,
  };
}

function toTechnologyMessage(message: {
  id: string;
  body: string;
  authorName: string | null;
  receivedAt: Date;
  metadata: unknown;
}): TechnologyMessage {
  const meta = (message.metadata ?? {}) as CommunicationMetadata;
  return {
    id: message.id,
    body: message.body,
    authorName: message.authorName,
    receivedAt: message.receivedAt,
    mentionedUserIds: meta.mentionedUserIds,
  };
}
