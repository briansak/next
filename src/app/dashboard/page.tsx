import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyViewerMentionBoost } from "@/lib/heuristics";
import { applyViewerDirectedQuestionBoost } from "@/lib/heuristics/email-questions";
import {
  computePlanningDashboardScore,
  formatDaysUntil,
} from "@/lib/heuristics/calendar-planning";
import { computeDashboardScore } from "@/lib/heuristics/recency";
import {
  resolveDashboardSummaries,
  type DashboardSummaryItem,
} from "@/lib/heuristics/dashboard-summary";
import { MEETING_LOOKBACK_DAYS, meetingVisibleToUser } from "@/lib/integrations/webex/meetings";
import { CardAiSummary } from "@/components/card-ai-summary";
import {
  DashboardCardLink,
  DashboardPlanningCardLink,
} from "@/components/dashboard-card-link";
import {
  formatFutureDate,
  formatRelativeAge,
  PriorityBadge,
} from "@/components/dashboard-ui";
import { EventPlanningTodos } from "@/components/event-planning-todos";
import { NextStepsPanel, type NextStepCardItem } from "@/components/next-steps-panel";
import { suggestEventPrepTodos } from "@/lib/heuristics/event-prep-suggestions";
import {
  applyUserNextStepOrder,
  formatNextStepHeadline,
  formatNextStepMeta,
} from "@/lib/heuristics/next-step-display";
import { applyViewerPriorityOverride } from "@/lib/communications/viewer-override";
import { isPrioritiesCommunication } from "@/lib/communications/space-purpose";
import { isInternalCallCommunication } from "@/lib/communications/internal-call";
import { scopedToTenant } from "@/lib/tenant";

interface CommunicationMetadata {
  mentionedUserIds?: string[];
  directedRecipientUserIds?: string[];
  toAddresses?: string[];
  ccAddresses?: string[];
  hasQuestion?: boolean;
  isMailer?: boolean;
  questionSnippets?: string[];
  viewerOverrides?: Record<
    string,
    { priority: string; priorityScore: number; hidden?: boolean }
  >;
}

interface CalendarMetadata {
  needsPlanning?: boolean;
  isRecurring?: boolean;
  daysUntil?: number;
  endTime?: string;
  location?: string;
  attendeeEmails?: string[];
  externalAttendees?: string[];
}

interface MeetingActionItem {
  title: string;
  assigneeUserIds?: string[];
  source?: "summary" | "transcript" | "gong";
}

interface TranscriptActionItemMeta {
  title: string;
  excerpt?: string;
  assigneeUserIds?: string[];
  assigneeAliases?: string[];
}

interface MeetingPersonMeta {
  email?: string;
  displayName?: string;
  response?: string;
}

interface MeetingMetadata {
  relevantUserEmails?: string[];
  connectedAccountEmails?: string[];
  inviteeEmails?: string[];
  invitees?: MeetingPersonMeta[];
  participantEmails?: string[];
  participants?: MeetingPersonMeta[];
  summaryText?: string;
  summarySource?: "webex-ai" | "ollama" | "gong" | "none";
  gongSummaryText?: string;
  gongActionItems?: string[];
  summaryActionItems?: string[];
  actionItems?: MeetingActionItem[];
  transcriptActionItems?: TranscriptActionItemMeta[];
  mentionedUserIds?: string[];
  transcriptText?: string;
  transcriptSource?: "webex" | "whisper" | "none";
  recordingDownloadUrl?: string;
  transcriptDownloadUrl?: string;
  webLink?: string;
  hostEmail?: string;
  hostDisplayName?: string;
  hasRecording?: boolean;
  hasSummary?: boolean;
  hasTranscription?: boolean;
}

function meetingActionItems(meta: MeetingMetadata): MeetingActionItem[] {
  if (meta.actionItems?.length) return meta.actionItems;
  if (meta.summaryActionItems?.length) {
    return meta.summaryActionItems.map((title) => ({ title }));
  }
  return (meta.gongActionItems ?? []).map((title) => ({ title, source: "gong" }));
}

function transcriptSourceLabel(source?: MeetingMetadata["transcriptSource"]): string | null {
  if (source === "webex") return "Transcript";
  if (source === "whisper") return "Transcribed";
  return null;
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const tenantWhere = scopedToTenant(session.tenantId);
  const userEmail = session.email.toLowerCase();

  let savedNextStepOrder: string[] = [];
  try {
    const membership = await prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: session.tenantId,
          userId: session.userId,
        },
      },
      select: { nextStepOrder: true },
    });

    savedNextStepOrder = Array.isArray(membership?.nextStepOrder)
      ? membership.nextStepOrder.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    savedNextStepOrder = [];
  }

  const rawCommunications = await prisma.communication
    .findMany({
      where: { ...tenantWhere, source: { in: ["WEBEX", "EMAIL", "OUTLOOK_CALENDAR"] } },
      orderBy: [{ receivedAt: "desc" }],
      take: 50,
      include: {
        nextSteps: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          select: { id: true, status: true, assigneeId: true },
        },
      },
    })
    .catch(() => []);

  const communications = rawCommunications
    .filter(
      (c) =>
        isPrioritiesCommunication(c.source, c.metadata) &&
        !isInternalCallCommunication(c.source, c.subject, c.tags, c.metadata)
    )
    .map((c) => {
      const metadata = (c.metadata ?? {}) as CommunicationMetadata;
      const boosted = applyViewerMentionBoost(
        c.priorityScore,
        metadata.mentionedUserIds,
        session.userId
      );
      const questionBoost = applyViewerDirectedQuestionBoost(
        boosted.score,
        metadata,
        { userId: session.userId, email: userEmail },
        c.tags.includes("directed-question")
      );
      const hasOpenNextStep = c.nextSteps.length > 0;
      const scored = computeDashboardScore({
        baseScore: questionBoost.score,
        receivedAt: c.receivedAt,
        tags: c.tags,
        mentionedYou: boosted.mentionedYou || questionBoost.directedQuestion,
        hasOpenNextStep,
      });
      const overrideApplied = applyViewerPriorityOverride(
        scored.score,
        scored.priority,
        c.metadata,
        session.userId
      );
      return {
        ...c,
        ...scored,
        score: overrideApplied.score,
        priority: overrideApplied.priority,
        hidden: overrideApplied.hidden,
        overridden: overrideApplied.overridden,
        mentionedYou: boosted.mentionedYou,
        directedQuestion: questionBoost.directedQuestion,
      };
    })
    .filter((c) => !c.hidden)
    .filter((c) => !c.deprioritized || c.overridden)
    .sort((a, b) => b.score - a.score || b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, 20);

  const now = new Date();
  const planningEvents = rawCommunications
    .filter((c) => c.source === "OUTLOOK_CALENDAR" && c.receivedAt > now)
    .map((c) => {
      const meta = (c.metadata ?? {}) as CalendarMetadata;
      if (meta.isRecurring || !c.tags.includes("plan-ahead")) return null;
      const planningScore = computePlanningDashboardScore({
        baseScore: c.priorityScore,
        start: c.receivedAt,
        tags: c.tags,
        needsPlanning: meta.needsPlanning ?? false,
        now,
      });
      const overrideApplied = applyViewerPriorityOverride(
        planningScore.score,
        c.priority,
        c.metadata,
        session.userId
      );
      return {
        ...c,
        ...planningScore,
        score: overrideApplied.score,
        priority: overrideApplied.priority,
        hidden: overrideApplied.hidden,
        overridden: overrideApplied.overridden,
        calendarMeta: meta,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && !c.hidden && c.score >= 4)
    .sort(
      (a, b) =>
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        b.score - a.score
    )
    .slice(0, 6);

  const isAdmin = session.role === "ADMIN";
  const rawMeetings = await prisma.communication
    .findMany({
      where: {
        ...tenantWhere,
        source: "WEBEX_MEETING",
        receivedAt: { gte: daysAgo(MEETING_LOOKBACK_DAYS) },
      },
      orderBy: [{ receivedAt: "desc" }],
      take: 40,
    })
    .catch(() => []);

  const meetings = rawMeetings
    .filter((m) =>
      meetingVisibleToUser((m.metadata ?? {}) as MeetingMetadata, userEmail, isAdmin)
    )
    .filter(
      (m) =>
        !isInternalCallCommunication(
          m.source,
          m.subject,
          m.tags,
          m.metadata
        )
    )
    .map((m) => {
      const meta = (m.metadata ?? {}) as MeetingMetadata;
      const boosted = applyViewerMentionBoost(
        m.priorityScore,
        meta.mentionedUserIds,
        session.userId
      );
      const yourAction = meetingActionItems(meta).some((item) =>
        item.assigneeUserIds?.includes(session.userId)
      );
      let score = boosted.score;
      if (yourAction) score = Math.min(10, score + 2);

      const overrideApplied = applyViewerPriorityOverride(
        score,
        m.priority,
        m.metadata,
        session.userId
      );

      return {
        ...m,
        score: overrideApplied.score,
        priority: overrideApplied.priority,
        hidden: overrideApplied.hidden,
        overridden: overrideApplied.overridden,
        mentionedYou: boosted.mentionedYou || yourAction,
      };
    })
    .filter((m) => !m.hidden)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.priorityScore - a.priorityScore ||
        b.receivedAt.getTime() - a.receivedAt.getTime()
    )
    .slice(0, 8);

  const summaryMap = await resolveDashboardSummaries(
    [
      ...communications.map(toDashboardSummaryItem),
      ...planningEvents.map(toDashboardSummaryItem),
      ...meetings.map(toDashboardSummaryItem),
    ],
    { maxGenerations: 15, concurrency: 4 }
  );

  const planningEventIds = planningEvents.map((event) => event.id);
  const eventNextSteps =
    planningEventIds.length === 0
      ? []
      : await prisma.nextStep
          .findMany({
            where: {
              ...tenantWhere,
              communicationId: { in: planningEventIds },
              status: { in: ["OPEN", "IN_PROGRESS"] },
            },
            select: {
              id: true,
              title: true,
              status: true,
              communicationId: true,
            },
            orderBy: [{ createdAt: "asc" }],
          })
          .catch(() => []);

  const nextStepsByEvent = new Map<string, typeof eventNextSteps>();
  for (const step of eventNextSteps) {
    if (!step.communicationId) continue;
    const list = nextStepsByEvent.get(step.communicationId) ?? [];
    list.push(step);
    nextStepsByEvent.set(step.communicationId, list);
  }

  const nextSteps = await prisma.nextStep
    .findMany({
      where: {
        ...tenantWhere,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { assigneeId: session.userId },
          { assigneeId: null },
        ],
        AND: [
          {
            OR: [
              { communicationId: null },
              { communication: { receivedAt: { gte: daysAgo(14) } } },
              {
                communication: {
                  source: "OUTLOOK_CALENDAR",
                  receivedAt: { gt: now },
                },
              },
            ],
          },
        ],
      },
      include: {
        communication: {
          select: {
            receivedAt: true,
            source: true,
            subject: true,
            authorName: true,
            excerpt: true,
          },
        },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      take: 10,
    })
    .catch(() => [])
    .then((steps) =>
      applyUserNextStepOrder(
        steps.sort((a, b) => {
          const aDate = a.communication?.receivedAt?.getTime() ?? 0;
          const bDate = b.communication?.receivedAt?.getTime() ?? 0;
          return bDate - aDate;
        }),
        savedNextStepOrder
      )
    );

  const nextStepCards: NextStepCardItem[] = nextSteps.map((step) => ({
    id: step.id,
    headline: formatNextStepHeadline({
      title: step.title,
      status: step.status,
      dueAt: step.dueAt,
      communication: step.communication,
    }),
    meta: formatNextStepMeta({
      title: step.title,
      status: step.status,
      dueAt: step.dueAt,
      communication: step.communication,
    }),
    communicationId: step.communicationId,
  }));

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>My Priorities</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          {session.partnerName ?? session.tenantName} — day-job correspondence and
          events for {session.name ?? session.email}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 300px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          {planningEvents.length > 0 && (
            <Panel title="Plan ahead" count={planningEvents.length}>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  marginBottom: "1rem",
                  lineHeight: 1.5,
                }}
              >
                Upcoming one-off events that may need coordination, prep, or
                partner outreach — not recurring standups. Add prep to-dos and
                they&apos;ll appear in Your next steps.
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {planningEvents.map((event) => {
                  const meta = event.calendarMeta;
                  const attendeePreview =
                    meta.externalAttendees?.slice(0, 2).join(", ") ||
                    meta.attendeeEmails?.slice(0, 2).join(", ");
                  return (
                    <li
                      key={event.id}
                      style={{
                        background: "rgba(232, 197, 91, 0.08)",
                        borderRadius: 8,
                        border: "1px solid var(--medium)",
                      }}
                    >
                      <DashboardPlanningCardLink id={event.id}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "0.25rem",
                            gap: "0.5rem",
                          }}
                        >
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                            <PriorityBadge priority={event.priority} />
                            <span
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                color: "var(--medium)",
                                textTransform: "uppercase",
                              }}
                            >
                              {formatDaysUntil(
                                meta.daysUntil ??
                                  Math.ceil(
                                    (event.receivedAt.getTime() - now.getTime()) /
                                      (1000 * 60 * 60 * 24)
                                  )
                              )}
                            </span>
                            {event.tags.includes("big-rock") && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "var(--high)",
                                  textTransform: "uppercase",
                                }}
                              >
                                Big rock
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {formatFutureDate(event.receivedAt)}
                          </span>
                        </div>
                        <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                          {event.subject}
                        </p>
                        <CardAiSummary
                          text={summaryMap.get(event.id)?.text ?? event.summary}
                          label={summaryMap.get(event.id)?.label}
                          source={summaryMap.get(event.id)?.source}
                        />
                        {(meta.location || attendeePreview) && (
                          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                            {meta.location ? `Location: ${meta.location}` : null}
                            {meta.location && attendeePreview ? " · " : null}
                            {attendeePreview ? `With: ${attendeePreview}` : null}
                          </p>
                        )}
                      </DashboardPlanningCardLink>
                      <div style={{ padding: "0 0.75rem 0.75rem" }}>
                        <EventPlanningTodos
                          communicationId={event.id}
                          eventSubject={event.subject ?? "this event"}
                          suggestions={suggestEventPrepTodos({
                            subject: event.subject ?? "Upcoming event",
                            location: meta.location,
                            tags: event.tags,
                            daysUntil: meta.daysUntil,
                          })}
                          existingSteps={nextStepsByEvent.get(event.id) ?? []}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <Panel title="Actionable communications" count={communications.length}>
            {communications.length === 0 ? (
              <EmptyState message="No communications yet. Connect integrations and sync to get started." />
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {communications.map((c) => (
                  <li key={c.id}>
                    <DashboardCardLink
                      id={c.id}
                      highlighted={c.mentionedYou || c.directedQuestion}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", gap: "0.5rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <PriorityBadge priority={c.priority} />
                          {c.mentionedYou && (
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
                          )}
                          {c.directedQuestion && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                color: "var(--high)",
                                textTransform: "uppercase",
                              }}
                            >
                              Question
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {c.source === "OUTLOOK_CALENDAR" && c.receivedAt > new Date()
                            ? formatFutureDate(c.receivedAt)
                            : `${formatRelativeAge(c.receivedAt)} · ${c.source}`}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                        {c.subject ?? c.authorName ?? c.source}
                      </p>
                      <CardAiSummary
                        text={summaryMap.get(c.id)?.text}
                        label={summaryMap.get(c.id)?.label}
                        source={summaryMap.get(c.id)?.source}
                      />
                      {!summaryMap.get(c.id)?.text && (
                        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          {c.excerpt ?? (c.body ? c.body.slice(0, 120) : "(no content)")}
                        </p>
                      )}
                    </DashboardCardLink>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside
          style={{
            position: "sticky",
            top: "1.5rem",
            alignSelf: "start",
          }}
        >
          <Panel title="Your next steps" count={nextStepCards.length}>
            {nextStepCards.length === 0 ? (
              <EmptyState message="No open next steps assigned to you." />
            ) : (
              <NextStepsPanel steps={nextStepCards} />
            )}
          </Panel>
        </aside>
      </div>

      <section style={{ marginTop: "1.5rem" }}>
        <Panel title={`Your meetings (last ${MEETING_LOOKBACK_DAYS} days)`} count={meetings.length}>
          {meetings.length === 0 ? (
            <EmptyState
              message={
                isAdmin
                  ? `No meetings in the last ${MEETING_LOOKBACK_DAYS} days. Run Sync now after reconnecting Webex as the account whose calendar you want (e.g. brsak@cisco.com).`
                  : `No meetings in the last ${MEETING_LOOKBACK_DAYS} days for ${session.email}. Meetings come from your Webex calendar, not allowlisted spaces.`
              }
            />
          ) : (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {meetings.map((m) => {
                const meta = (m.metadata ?? {}) as MeetingMetadata;
                const cardSummary = summaryMap.get(m.id);
                const summary =
                  cardSummary?.text?.trim() ||
                  meta.gongSummaryText?.trim() ||
                  null;
                const summaryLabel = summary
                  ? cardSummary?.label ?? (meta.gongSummaryText?.trim() ? "Gong AI" : null)
                  : null;
                const summarySource =
                  cardSummary?.source ?? (meta.gongSummaryText?.trim() ? "gong" : null);
                const transcriptLabel = transcriptSourceLabel(meta.transcriptSource);
                const attributed =
                  meta.relevantUserEmails?.[0] ?? meta.connectedAccountEmails?.[0];
                const mentionedYou = m.mentionedYou;
                return (
                  <li key={m.id}>
                    <DashboardCardLink id={m.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", gap: "0.5rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <PriorityBadge priority={m.priority} />
                          {mentionedYou && (
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
                          )}
                          {summaryLabel && (
                            <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--low)", textTransform: "uppercase" }}>
                              {summaryLabel}
                            </span>
                          )}
                          {transcriptLabel && (
                            <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--medium)", textTransform: "uppercase" }}>
                              {transcriptLabel}
                            </span>
                          )}
                          {meta.hasRecording && !meta.recordingDownloadUrl && (
                            <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--medium)", textTransform: "uppercase" }}>
                              Recording
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatRelativeAge(m.receivedAt)}
                        </span>
                      </div>
                      <p style={{ fontWeight: 500, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                        {m.subject ?? "Meeting"}
                      </p>
                      {(m.authorName || meta.hostEmail) && (
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                          Host: {m.authorName ?? meta.hostEmail}
                          {isAdmin && attributed && attributed !== userEmail
                            ? ` · Synced for ${attributed}`
                            : ""}
                        </p>
                      )}
                      <CardAiSummary
                        text={
                          summary ??
                          (meta.hasRecording
                            ? "Recording available — open for transcript and summary."
                            : meta.hasSummary
                              ? "Webex AI summary available — open to view details."
                              : m.excerpt ?? "No summary available for this meeting.")
                        }
                        label={summary ? summaryLabel : null}
                        source={summarySource}
                      />
                    </DashboardCardLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>
    </main>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "1.25rem",
      }}
    >
      <h2 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>
        {title}
        <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: "0.5rem" }}>
          ({count})
        </span>
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>{message}</p>
  );
}

function toDashboardSummaryItem(item: {
  id: string;
  tenantId: string;
  source: DashboardSummaryItem["source"];
  subject: string | null;
  body: string;
  excerpt: string | null;
  summary: string | null;
  authorName: string | null;
  metadata: unknown;
}): DashboardSummaryItem {
  return {
    id: item.id,
    tenantId: item.tenantId,
    source: item.source,
    subject: item.subject,
    body: item.body,
    excerpt: item.excerpt,
    summary: item.summary,
    authorName: item.authorName,
    metadata: item.metadata,
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
