import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyViewerMentionBoost } from "@/lib/heuristics";
import type { MentionUser } from "@/lib/heuristics/mentions";
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
import { CardAiSummary } from "@/components/card-ai-summary";
import {
  DashboardCardLink,
  DashboardPlanningCardLink,
} from "@/components/dashboard-card-link";
import {
  formatFutureDate,
  formatRelativeAge,
  AttentionChip,
  MetaChip,
} from "@/components/dashboard-ui";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection, PageShell } from "@/components/ui/page-shell";
import { Panel } from "@/components/ui/panel";
import { EventPlanningTodos } from "@/components/event-planning-todos";
import { NextStepsPanel, type NextStepCardItem } from "@/components/next-steps-panel";
import { AddManualNextStep } from "@/components/add-manual-next-step";
import { suggestEventPrepTodos } from "@/lib/heuristics/event-prep-suggestions";
import {
  formatNextStepCardDisplay,
} from "@/lib/heuristics/next-step-display";
import { rankNextStepsForViewer } from "@/lib/heuristics/next-step-ranking";
import { reclaimOrphanedNextSteps } from "@/lib/next-steps/reclaim";
import { applyViewerPriorityOverride } from "@/lib/communications/viewer-override";
import { isPrioritiesCommunication, isDealCommunication, isDayJobCommunication } from "@/lib/communications/space-purpose";
import { isInternalCallCommunication } from "@/lib/communications/internal-call";
import { isProductAnnouncementCommunication } from "@/lib/communications/product-announcement";
import { PartnerAsksPanel } from "@/components/partner-asks-panel";
import { collectPartnerAsks } from "@/lib/heuristics/partner-asks";
import {
  loadPartnerAskCandidates,
  PARTNER_ASK_LOOKBACK_DAYS,
} from "@/lib/partner-asks/load-candidates";
import { getEmailAllowlistRules } from "@/lib/integrations/email/ingest";
import { partnerCoverageFromRules } from "@/lib/integrations/email/partner-rules";
import { travelLogisticsLabel } from "@/lib/heuristics/calendar-event-clustering";
import {
  resolveDealSpaceSummary,
  type DealMessage,
} from "@/lib/heuristics/deal-summary";
import { loadUserMeetingsContext } from "@/lib/meetings/user-meetings";
import { MorningBriefPanel } from "@/components/morning-brief-panel";
import { CommitmentLedgerPanel } from "@/components/commitment-ledger-panel";
import {
  buildMorningBrief,
  enrichPartnerAsksWithSla,
  hoursUntil,
  upcomingMeetingLabel,
} from "@/lib/heuristics/morning-brief";
import { evaluateStaleSla } from "@/lib/heuristics/stale-sla";
import {
  syncCommitmentsForUser,
  listOpenCommitments,
} from "@/lib/commitments/sync";
import {
  getUserPreferences,
  getUserOllamaRuntime,
  loadDashboardHiddenCommunicationIds,
  resolveAllowOllamaForUi,
} from "@/lib/user/preferences";
import { getAppConfig } from "@/lib/config/app-config-store";

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
  eventKind?: string;
  parentEventId?: string;
  clusterId?: string;
  destinationHint?: string;
  missingTravel?: boolean;
  linkedTravelIds?: string[];
}

const DEAL_LOOKBACK_DAYS = 14;

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const userEmail = session.email.toLowerCase();
  const viewerMention: MentionUser = {
    id: session.userId,
    name: session.name ?? null,
    email: session.email,
  };

  let savedNextStepOrder: string[] = [];
  let allowOllamaSummaries = false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { nextStepOrder: true, allowOllamaSummaries: true },
    });

    savedNextStepOrder = Array.isArray(user?.nextStepOrder)
      ? user.nextStepOrder.filter((id): id is string => typeof id === "string")
      : [];
    allowOllamaSummaries = user?.allowOllamaSummaries ?? false;
  } catch {
    savedNextStepOrder = [];
    allowOllamaSummaries = false;
  }

  const memberPreferences = await getUserPreferences(session.userId);
  const appConfig = await getAppConfig(session.userId);
  const ollamaRuntime = await getUserOllamaRuntime(session.userId);
  const allowOllama = resolveAllowOllamaForUi({
    allowOllamaSummaries,
    ollamaAvailable: memberPreferences.ollamaAvailable,
  });
  const hiddenCommunicationIds = await loadDashboardHiddenCommunicationIds(session.userId
  );

  const rawCommunications = await prisma.communication
    .findMany({
      where: { source: { in: ["WEBEX", "EMAIL", "OUTLOOK_CALENDAR"] } },
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
        !isInternalCallCommunication(c.source, c.subject, c.tags, c.metadata) &&
        !isProductAnnouncementCommunication(c.tags, c.metadata) &&
        !(
          c.source === "OUTLOOK_CALENDAR" &&
          (c.tags.includes("calendar-hold") || c.tags.includes("routine"))
        )
    )
    .map((c) => {
      const metadata = (c.metadata ?? {}) as CommunicationMetadata;
      const boosted = applyViewerMentionBoost(
        c.priorityScore,
        metadata.mentionedUserIds,
        session.userId,
        {
          text: [c.subject, c.body].filter(Boolean).join("\n"),
          viewer: viewerMention,
        }
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
        session.userId,
        { communicationId: c.id, hiddenCommunicationIds }
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
      if (
        meta.isRecurring ||
        c.tags.includes("calendar-hold") ||
        c.tags.includes("routine")
      ) {
        return null;
      }
      const isRockEvent = c.tags.includes("rock-event");
      if (!c.tags.includes("plan-ahead") && !isRockEvent) return null;
      const planningScore = computePlanningDashboardScore({
        baseScore: isRockEvent ? Math.max(c.priorityScore, 6) : c.priorityScore,
        start: c.receivedAt,
        tags: c.tags,
        needsPlanning: meta.needsPlanning ?? isRockEvent,
        now,
      });
      const overrideApplied = applyViewerPriorityOverride(
        planningScore.score,
        c.priority,
        c.metadata,
        session.userId,
        { communicationId: c.id, hiddenCommunicationIds }
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
    .filter((c) => !(c.calendarMeta.parentEventId && c.tags.includes("travel-logistics")))
    .sort(
      (a, b) =>
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        b.score - a.score
    )
    .slice(0, 6);

  const linkedTravelByParent = new Map<string, typeof rawCommunications>();
  for (const event of rawCommunications) {
    if (event.source !== "OUTLOOK_CALENDAR" || event.receivedAt <= now) continue;
    const meta = (event.metadata ?? {}) as CalendarMetadata;
    if (!meta.parentEventId) continue;
    const siblings = linkedTravelByParent.get(meta.parentEventId) ?? [];
    siblings.push(event);
    linkedTravelByParent.set(meta.parentEventId, siblings);
  }

  const { rawMeetings, meetings } = await loadUserMeetingsContext({
    userId: session.userId,
    userEmail,
    viewer: viewerMention,
    hiddenCommunicationIds,
  });

  await reclaimOrphanedNextSteps({
    userId: session.userId,
    viewer: viewerMention,
    now,
  }).catch(() => {});

  const nextSteps = await prisma.nextStep
    .findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { assigneeId: session.userId },
          {
            createdById: session.userId,
            communicationId: null,
          },
        ],
      },
      include: {
        communication: {
          select: {
            id: true,
            receivedAt: true,
            source: true,
            subject: true,
            authorName: true,
            excerpt: true,
            summary: true,
            body: true,
            metadata: true,
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 25,
    })
    .catch(() => [])
    .then((steps) =>
      rankNextStepsForViewer(steps, session.userId, savedNextStepOrder, now).slice(
        0,
        10
      )
    );

  const summaryBatchIds = new Set<string>();
  const summaryBatch: DashboardSummaryItem[] = [];
  for (const item of [...communications, ...planningEvents]) {
    if (summaryBatchIds.has(item.id)) continue;
    summaryBatchIds.add(item.id);
    summaryBatch.push(toDashboardSummaryItem(item));
  }
  for (const step of nextSteps) {
    const communication = step.communication;
    if (!communication || summaryBatchIds.has(communication.id)) continue;
    summaryBatchIds.add(communication.id);
    summaryBatch.push(toDashboardSummaryItem(communication));
  }

  const summaryMap = await resolveDashboardSummaries(summaryBatch, {
    maxGenerations: allowOllama ? 6 : 0,
    allowOllama,
    ollamaRuntime,
  });

  const partnerAskCandidates = await loadPartnerAskCandidates({
    since: daysAgo(PARTNER_ASK_LOOKBACK_DAYS),
  }).catch(() => []);

  const dayJobCommunicationIds = new Set(
    rawCommunications
      .filter((c) => isDayJobCommunication(c.source, c.metadata))
      .map((c) => c.id)
  );

  const partnerAllowlistRules = await getEmailAllowlistRules().catch(
    () => []
  );
  const partnerCoverage = partnerCoverageFromRules(partnerAllowlistRules);

  const partnerAsks = collectPartnerAsks(partnerAskCandidates, {
    userId: session.userId,
    hiddenCommunicationIds,
    partnerCoverage,
  });
  const partnerAsksWithSla = partnerAsks.map((ask) => ({
    ...ask,
    sla: evaluateStaleSla(ask.receivedAt, { now, slaHours: appConfig.partnerAskSlaHours }),
  }));
  const stalePartnerAsks = enrichPartnerAsksWithSla(
    partnerAsks,
    now,
    appConfig.partnerAskSlaHours
  );

  await syncCommitmentsForUser({
    userId: session.userId,
    partnerAsks: partnerAsks.filter((ask) =>
      dayJobCommunicationIds.has(ask.communicationId)
    ),
    meetings: meetings.map((m) => ({
      id: m.id,
      metadata: m.metadata,
      receivedAt: m.receivedAt,
    })),
    nextSteps: nextSteps
      .filter(
        (step) =>
          !step.communicationId ||
          (step.communication &&
            isDayJobCommunication(
              step.communication.source,
              step.communication.metadata
            ))
      )
      .map((step) => ({
        id: step.id,
        title: step.title,
        communicationId: step.communicationId,
        assigneeId: step.assigneeId,
        dueAt: step.dueAt,
      })),
  });

  const openCommitments = await listOpenCommitments(12);

  const upcomingForBrief = [
    ...planningEvents.map((event) => ({
      id: event.id,
      subject: event.subject,
      receivedAt: event.receivedAt,
      hoursUntil: hoursUntil(event.receivedAt, now),
      label: upcomingMeetingLabel(hoursUntil(event.receivedAt, now)),
    })),
    ...rawMeetings
      .filter(
        (m) =>
          m.source === "WEBEX_MEETING" &&
          m.receivedAt > now &&
          m.receivedAt.getTime() - now.getTime() <= 48 * 60 * 60 * 1000
      )
      .map((m) => ({
        id: m.id,
        subject: m.subject,
        receivedAt: m.receivedAt,
        hoursUntil: hoursUntil(m.receivedAt, now),
        label: upcomingMeetingLabel(hoursUntil(m.receivedAt, now)),
      })),
  ]
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .slice(0, 4);

  const morningBrief = buildMorningBrief({
    userName: session.name,
    now,
    partnerAsks,
    staleAsks: stalePartnerAsks,
    upcomingMeetings: upcomingForBrief,
    commitments: openCommitments,
    planningEventCount: planningEvents.length,
    mentionedCount: communications.filter((c) => c.mentionedYou).length,
  });

  const webexPolicy = await prisma.ingestionPolicy
    .findFirst({
      where: { source: "WEBEX" },
      include: {
        webexAllowlists: {
          where: { purpose: "DEAL" },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    .catch(() => null);

  const dealSpaces = webexPolicy?.webexAllowlists ?? [];
  const dealMessagesRaw =
    dealSpaces.length > 0
      ? await prisma.communication
          .findMany({
            where: {
              source: "WEBEX",
              receivedAt: { gte: daysAgo(DEAL_LOOKBACK_DAYS) },
            },
            orderBy: { receivedAt: "desc" },
            take: 300,
          })
          .catch(() => [])
      : [];

  const dealMessages = dealMessagesRaw.filter((message) =>
    isDealCommunication(message.metadata)
  );

  const dealMessagesBySpace = new Map<string, typeof dealMessages>();
  for (const message of dealMessages) {
    const roomId = (message.metadata as { roomId?: string }).roomId;
    if (!roomId) continue;
    const bucket = dealMessagesBySpace.get(roomId) ?? [];
    bucket.push(message);
    dealMessagesBySpace.set(roomId, bucket);
  }

  const activeDeals = await Promise.all(
    dealSpaces.map(async (space) => {
      const messages = dealMessagesBySpace.get(space.spaceId) ?? [];
      const summary = await resolveDealSpaceSummary({
        allowlistId: space.id,
        spaceTitle: space.spaceTitle ?? "Deal space",
        dealLabel: space.dealLabel,
        messages: messages.map(toDealMessage),
        cache: space.dealSummaryCache,
        allowOllama,
        persistCache: async (cache) => {
          await prisma.webexSpaceAllowlist.update({
            where: { id: space.id },
            data: { dealSummaryCache: cache },
          });
        },
      });

      return {
        spaceId: space.spaceId,
        spaceTitle: space.spaceTitle ?? space.spaceId,
        dealLabel: space.dealLabel,
        summary,
        messageCount: messages.length,
        latestAt: messages[0]?.receivedAt ?? null,
      };
    })
  );

  const planningEventIds = planningEvents.map((event) => event.id);
  const eventNextSteps =
    planningEventIds.length === 0
      ? []
      : await prisma.nextStep
          .findMany({
            where: {
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

  const nextStepCards: NextStepCardItem[] = nextSteps.map((step) => {
    const communication = step.communication;
    const dashboardSummary = communication
      ? summaryMap.get(communication.id)
      : undefined;
    const display = formatNextStepCardDisplay(
      {
        title: step.title,
        status: step.status,
        dueAt: step.dueAt,
        description: step.description,
        communication,
      },
      dashboardSummary
        ? {
            text: dashboardSummary.text,
            label: dashboardSummary.label,
            source: dashboardSummary.source,
          }
        : null
    );

    return {
      id: step.id,
      headline: display.headline,
      meta: display.meta,
      communicationId: step.communicationId,
      summaryText: display.summary?.text ?? null,
      summaryLabel: display.summary?.label ?? null,
      summarySource: display.summary?.source ?? null,
    };
  });

  return (
    <PageShell
      title="My Priorities"
      description={`${session.partnerName ?? session.partnerName} — day-job correspondence and events for ${session.name ?? session.email}`}
    >
      <PageSection>
        <MorningBriefPanel brief={morningBrief} />
      </PageSection>

      {activeDeals.length > 0 ? (
        <PageSection>
          <CollapsiblePanel title="Active deals" count={activeDeals.length}>
            <ul className="list-stack">
              {activeDeals.map((deal) => (
                <li key={deal.spaceId} className="card-item">
                  <div className="card__meta">
                    <div>
                      <p className="card__title">{deal.dealLabel ?? deal.spaceTitle}</p>
                      {deal.dealLabel ? (
                        <p className="text-xs text-muted">{deal.spaceTitle}</p>
                      ) : null}
                    </div>
                    <span className="card__timestamp">
                      {deal.latestAt
                        ? formatRelativeAge(deal.latestAt)
                        : `${deal.messageCount} messages`}
                    </span>
                  </div>
                  <CardAiSummary
                    text={deal.summary.text}
                    label={deal.summary.label}
                    source={deal.summary.source}
                    variant="teaser"
                  />
                  {deal.summary.asks.length > 0 ? (
                    <p className="text-xs text-muted" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                      {deal.summary.asks.length} open ask{deal.summary.asks.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CollapsiblePanel>
        </PageSection>
      ) : null}

      {partnerAsks.length > 0 ? (
        <PageSection>
          <CollapsiblePanel title="Open partner asks" count={partnerAsks.length}>
            <PartnerAsksPanel asks={partnerAsksWithSla} />
          </CollapsiblePanel>
        </PageSection>
      ) : null}

      <div className="dashboard-layout">
        <div className="dashboard-layout__main">
          {planningEvents.length > 0 && (
            <Panel title="Plan ahead" count={planningEvents.length} id="plan-ahead">
              <ul className="list-stack">
                {planningEvents.map((event) => {
                  const meta = event.calendarMeta;
                  const linkedTravel = linkedTravelByParent.get(event.id) ?? [];
                  const attendeePreview =
                    meta.externalAttendees?.slice(0, 2).join(", ") ||
                    meta.attendeeEmails?.slice(0, 2).join(", ");
                  const prepSuggestions = suggestEventPrepTodos({
                    subject: event.subject ?? "Upcoming event",
                    location: meta.location,
                    tags: event.tags,
                    daysUntil: meta.daysUntil,
                  }).filter((suggestion) => {
                    if (!/book travel/i.test(suggestion)) return true;
                    return meta.missingTravel === true;
                  });
                  const eventLabel =
                    event.tags.includes("rock-event")
                      ? "Rock event"
                      : event.tags.includes("big-rock")
                        ? "Big rock"
                        : null;
                  return (
                    <li key={event.id} className="card">
                      <DashboardPlanningCardLink id={event.id} priority={event.priority}>
                        <div className="card__meta">
                          <div className="card__meta-start">
                            <MetaChip
                              label={formatDaysUntil(
                                meta.daysUntil ??
                                  Math.ceil(
                                    (event.receivedAt.getTime() - now.getTime()) /
                                      (1000 * 60 * 60 * 24)
                                  )
                              )}
                              variant="medium"
                            />
                            {eventLabel ? <MetaChip label={eventLabel} variant="high" /> : null}
                            {meta.missingTravel ? (
                              <MetaChip label="Travel not booked" variant="critical" />
                            ) : null}
                          </div>
                          <span className="card__timestamp">{formatFutureDate(event.receivedAt)}</span>
                        </div>
                        <p className="card__title">{event.subject}</p>
                        <CardAiSummary
                          text={summaryMap.get(event.id)?.text ?? event.summary}
                          label={summaryMap.get(event.id)?.label}
                          source={summaryMap.get(event.id)?.source}
                          variant="teaser"
                        />
                        {(meta.location || attendeePreview || meta.destinationHint) && (
                          <p className="text-xs text-muted" style={{ marginTop: "0.35rem" }}>
                            {meta.destinationHint
                              ? meta.destinationHint
                              : meta.location
                                ? meta.location
                                : null}
                            {(meta.destinationHint || meta.location) && attendeePreview ? " · " : null}
                            {attendeePreview ? attendeePreview : null}
                          </p>
                        )}
                        {linkedTravel.length > 0 && (
                          <ul
                            style={{
                              listStyle: "none",
                              marginTop: "0.5rem",
                              paddingLeft: "0.75rem",
                              borderLeft: "2px solid var(--border)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.35rem",
                            }}
                          >
                            {linkedTravel.map((travel) => {
                              const travelMeta = (travel.metadata ?? {}) as CalendarMetadata;
                              return (
                                <li key={travel.id} style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                  <span
                                    style={{
                                      fontSize: "0.62rem",
                                      fontWeight: 600,
                                      color: "var(--low)",
                                      textTransform: "uppercase",
                                      marginRight: "0.35rem",
                                    }}
                                  >
                                    {travelLogisticsLabel(
                                      (travelMeta.eventKind as
                                        | "travel-flight"
                                        | "travel-hotel"
                                        | "travel-other"
                                        | "meeting"
                                        | "conference") ?? "travel-other"
                                    )}
                                  </span>
                                  {travel.subject} · {formatFutureDate(travel.receivedAt)}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </DashboardPlanningCardLink>
                      <div style={{ padding: "0 0.75rem 0.75rem" }}>
                        <EventPlanningTodos
                          communicationId={event.id}
                          eventSubject={event.subject ?? "this event"}
                          suggestions={prepSuggestions}
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
              <ul className="list-stack">
                {communications.map((c) => (
                  <li key={c.id}>
                    <DashboardCardLink
                      id={c.id}
                      highlighted={c.mentionedYou || c.directedQuestion}
                      priority={c.priority}
                    >
                      <div className="card__meta">
                        <div className="card__meta-start">
                          {(c.mentionedYou || c.directedQuestion) && <AttentionChip />}
                        </div>
                        <span className="card__timestamp">
                          {c.source === "OUTLOOK_CALENDAR" && c.receivedAt > new Date()
                            ? formatFutureDate(c.receivedAt)
                            : formatRelativeAge(c.receivedAt)}
                        </span>
                      </div>
                      <p className="card__title">{c.subject ?? c.authorName ?? c.source}</p>
                      <CardAiSummary
                        text={summaryMap.get(c.id)?.text}
                        label={summaryMap.get(c.id)?.label}
                        source={summaryMap.get(c.id)?.source}
                        variant="teaser"
                      />
                      {!summaryMap.get(c.id)?.text && (
                        <p className="line-clamp-2 text-sm text-muted" style={{ marginTop: "0.25rem" }}>
                          {c.excerpt ?? (c.body ? c.body.slice(0, 140) : "(no content)")}
                        </p>
                      )}
                    </DashboardCardLink>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="dashboard-layout__aside">
          <Panel title="Your next steps" count={nextStepCards.length}>
            <AddManualNextStep />
            {nextStepCards.length === 0 ? (
              <EmptyState message="No open next steps assigned to you. Paste a CFP, deadline, or task above to add one." />
            ) : (
              <NextStepsPanel steps={nextStepCards} />
            )}
          </Panel>
        </aside>
      </div>

      {openCommitments.length > 0 ? (
        <PageSection>
          <CollapsiblePanel title="Commitment ledger" count={openCommitments.length}>
            <CommitmentLedgerPanel commitments={openCommitments} />
          </CollapsiblePanel>
        </PageSection>
      ) : null}
    </PageShell>
  );
}

function toDashboardSummaryItem(item: {
  id: string;
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
    source: item.source,
    subject: item.subject,
    body: item.body,
    excerpt: item.excerpt,
    summary: item.summary,
    authorName: item.authorName,
    metadata: item.metadata,
  };
}

function toDealMessage(message: {
  id: string;
  body: string;
  authorName: string | null;
  receivedAt: Date;
  metadata: unknown;
}): DealMessage {
  const meta = (message.metadata ?? {}) as { mentionedUserIds?: string[] };
  return {
    id: message.id,
    body: message.body,
    authorName: message.authorName,
    receivedAt: message.receivedAt,
    mentionedUserIds: meta.mentionedUserIds,
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
