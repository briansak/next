import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { CardAiSummary, GongMeetingSummary } from "@/components/card-ai-summary";
import {
  formatDateTime,
  formatFutureDate,
  formatRelativeAge,
  PriorityBadge,
  sourceLabel,
} from "@/components/dashboard-ui";
import { EventPlanningTodos } from "@/components/event-planning-todos";
import { MeetingParticipants } from "@/components/meeting-participants";
import { prisma } from "@/lib/db";
import { formatCommunicationBody } from "@/lib/communications/format-body";
import { applyViewerPriorityOverride } from "@/lib/communications/viewer-override";
import { isTechnologyCommunication, isDealCommunication } from "@/lib/communications/space-purpose";
import {
  internalCallReplayUrl,
  isInternalCallCommunication,
  type InternalCallMetadata,
} from "@/lib/communications/internal-call";
import {
  resolveDashboardSummary,
  type DashboardSummaryItem,
} from "@/lib/heuristics/dashboard-summary";
import { suggestEventPrepTodos } from "@/lib/heuristics/event-prep-suggestions";
import {
  meetingRecordingHref,
  meetingVisibleToUser,
} from "@/lib/integrations/webex/meetings";
import { MeetingRecordingLinks } from "@/components/meeting-recording-links";
import { MeetingHighlights } from "@/components/meeting-highlights";
import { MeetingSourceBadges } from "@/components/meeting-source-badges";
import {
  meetingSourceBadges,
  resolveUnifiedMeetingSummary,
  type UnifiedMeetingMetadata,
} from "@/lib/integrations/meetings/unify";
import {
  getUserOllamaRuntime,
  getUserPreferences,
  loadDashboardHiddenCommunicationIds,
  resolveAllowOllamaForUi,
} from "@/lib/user/preferences";
import { PriorityControls } from "@/components/priority-controls";

interface EmailMetadata {
  toAddresses?: string[];
  ccAddresses?: string[];
  fromAddress?: string;
  questionSnippets?: string[];
}

interface CalendarMetadata {
  endTime?: string;
  location?: string;
  attendeeEmails?: string[];
  externalAttendees?: string[];
  daysUntil?: number;
  isRecurring?: boolean;
}

interface MeetingMetadata extends UnifiedMeetingMetadata {
  inviteeEmails?: string[];
  invitees?: Array<{ email?: string; displayName?: string; response?: string }>;
  participantEmails?: string[];
  participants?: Array<{ email?: string; displayName?: string; response?: string }>;
  transcriptDownloadUrl?: string;
  recordingId?: string;
  webLink?: string;
  hostEmail?: string;
  hostDisplayName?: string;
  hasRecording?: boolean;
  hasSummary?: boolean;
  callHighlights?: Array<{
    timestamp: string;
    startSeconds: number;
    title: string;
    description: string;
  }>;
}

export default async function CommunicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const communication = await prisma.communication.findFirst({
    where: {
      id,
      },
    include: {
      nextSteps: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!communication) {
    notFound();
  }

  const isAdmin = true;
  const userEmail = session.email.toLowerCase();
  const hiddenCommunicationIds = await loadDashboardHiddenCommunicationIds(session.userId
  );
  const meta = (communication.metadata ?? {}) as Record<string, unknown>;
  const now = new Date();

  if (communication.source === "WEBEX_MEETING") {
    const visible = meetingVisibleToUser(meta as MeetingMetadata, userEmail, isAdmin);
    if (!visible) {
      notFound();
    }
  }

  const summaryItem: DashboardSummaryItem = {
    id: communication.id,
    source: communication.source,
    subject: communication.subject,
    body: communication.body,
    excerpt: communication.excerpt,
    summary: communication.summary,
    authorName: communication.authorName,
    metadata: communication.metadata,
  };

  const ollamaRuntime = await getUserOllamaRuntime(session.userId);
  const aiSummary = await resolveDashboardSummary(summaryItem, {
    allowOllama: resolveAllowOllamaForUi(
      await getUserPreferences(session.userId)
    ),
    ollamaRuntime,
  });
  const meetingMeta = meta as MeetingMetadata;
  const unifiedSummary = resolveUnifiedMeetingSummary(
    meetingMeta,
    communication.summary
  );
  const summaryText =
    unifiedSummary?.text?.trim() ||
    aiSummary.text?.trim() ||
    null;
  const summarySource = unifiedSummary?.source ?? aiSummary.source;
  const summaryLabel = unifiedSummary?.label ?? aiSummary.label;
  const meetingBadges =
    communication.source === "WEBEX_MEETING"
      ? meetingSourceBadges(meetingMeta)
      : [];
  const formattedBody = formatCommunicationBody(communication.body);
  const emailMeta = meta as EmailMetadata;
  const calendarMeta = meta as CalendarMetadata;
  const baseOverride = applyViewerPriorityOverride(
    communication.priorityScore,
    communication.priority,
    communication.metadata,
    session.userId,
    { communicationId: communication.id, hiddenCommunicationIds }
  );
  const displayPriority = baseOverride.priority;
  const displayOverridden = baseOverride.overridden;
  const displayHidden = baseOverride.hidden;

  const isFutureCalendar =
    communication.source === "OUTLOOK_CALENDAR" &&
    communication.receivedAt > now;

  const prepSuggestions =
    communication.source === "OUTLOOK_CALENDAR" && isFutureCalendar
      ? suggestEventPrepTodos({
          subject: communication.subject ?? "Upcoming event",
          location: calendarMeta.location,
          tags: communication.tags,
          daysUntil: calendarMeta.daysUntil,
        })
      : [];

  const meetingActionItems =
    meetingMeta.actionItems?.map((item) => item.title) ??
    meetingMeta.summaryActionItems ??
    meetingMeta.gongActionItems ??
    [];

  const fromTechnologies = isTechnologyCommunication(communication.metadata);
  const fromDealSpace = isDealCommunication(communication.metadata);
  const fromInternalCalls = isInternalCallCommunication(
    communication.source,
    communication.subject,
    communication.tags,
    communication.metadata
  );
  const internalCallMeta = meta as InternalCallMetadata;
  const backHref = fromTechnologies
    ? "/technologies"
    : fromInternalCalls
      ? "/internal-calls"
      : "/dashboard";
  const backLabel = fromTechnologies
    ? "Technology Updates"
    : fromInternalCalls
      ? "Meeting Summaries"
      : "My Priorities";

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <Link
        href={backHref}
        style={{
          fontSize: "0.875rem",
          color: "var(--accent)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "1.25rem",
        }}
      >
        ← Back to {backLabel}
      </Link>

      <header style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          {!fromTechnologies && !fromDealSpace && <PriorityBadge priority={displayPriority} />}
          {meetingBadges.length > 0 ? (
            <MeetingSourceBadges badges={meetingBadges} />
          ) : null}
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {sourceLabel(communication.source)}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {isFutureCalendar
              ? formatFutureDate(communication.receivedAt)
              : formatRelativeAge(communication.receivedAt)}
          </span>
        </div>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 600, lineHeight: 1.35 }}>
          {communication.subject ?? communication.authorName ?? "Communication"}
        </h1>
        {!fromTechnologies && (
          <div style={{ marginTop: "0.75rem" }}>
            <PriorityControls
              communicationId={communication.id}
              priority={displayPriority}
              overridden={displayOverridden}
              hidden={displayHidden}
            />
          </div>
        )}
        {(communication.authorName || communication.authorEmail) && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            {communication.source === "EMAIL" ? "From" : "By"}:{" "}
            {communication.authorName ?? communication.authorEmail}
            {communication.authorName && communication.authorEmail
              ? ` <${communication.authorEmail}>`
              : null}
          </p>
        )}
        {communication.source === "EMAIL" &&
          (emailMeta.toAddresses?.length || emailMeta.ccAddresses?.length) && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
              {emailMeta.toAddresses?.length
                ? `To: ${emailMeta.toAddresses.join(", ")}`
                : null}
              {emailMeta.toAddresses?.length && emailMeta.ccAddresses?.length
                ? " · "
                : null}
              {emailMeta.ccAddresses?.length
                ? `Cc: ${emailMeta.ccAddresses.join(", ")}`
                : null}
            </p>
          )}
        {communication.source === "OUTLOOK_CALENDAR" && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
            {formatDateTime(communication.receivedAt)}
            {calendarMeta.endTime
              ? ` – ${formatDateTime(new Date(calendarMeta.endTime))}`
              : null}
            {calendarMeta.location ? ` · ${calendarMeta.location}` : null}
          </p>
        )}
      </header>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Summary
        </h2>
        <CardAiSummary
          text={summaryText}
          label={summaryLabel}
          source={summarySource}
          maxBullets={8}
        />
        {!fromTechnologies && communication.priorityReasons.length > 0 && (
          <ul
            style={{
              marginTop: "0.75rem",
              paddingLeft: "1.1rem",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {communication.priorityReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </section>

      {communication.source === "OUTLOOK_CALENDAR" &&
        (calendarMeta.attendeeEmails?.length ||
          calendarMeta.externalAttendees?.length) && (
          <section
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "1.25rem",
              marginBottom: "1.25rem",
            }}
          >
            <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Attendees
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              {[
                ...(calendarMeta.externalAttendees ?? []),
                ...(calendarMeta.attendeeEmails ?? []),
              ].join(", ")}
            </p>
          </section>
        )}

      {(fromInternalCalls || communication.source === "WEBEX_MEETING") &&
        (internalCallMeta.callHighlights?.length ?? meetingMeta.callHighlights?.length ?? 0) >
          0 && (
        <MeetingHighlights
          highlights={
            internalCallMeta.callHighlights ??
            meetingMeta.callHighlights ??
            []
          }
          recordingHref={
            fromInternalCalls
              ? internalCallReplayUrl(internalCallMeta)
              : meetingRecordingHref(meetingMeta)
          }
        />
      )}

      {communication.source === "WEBEX_MEETING" &&
        meetingActionItems.length > 0 &&
        !meetingMeta.gongSummaryText && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Action items
          </h2>
          <ul
            style={{
              paddingLeft: "1.1rem",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            {meetingActionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {communication.source === "WEBEX_MEETING" && (
        <MeetingParticipants
          participants={meetingMeta.participants}
          invitees={meetingMeta.invitees}
          participantEmails={meetingMeta.participantEmails}
          inviteeEmails={meetingMeta.inviteeEmails}
        />
      )}

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          {communication.source === "OUTLOOK_CALENDAR"
            ? "Event details"
            : communication.source === "WEBEX_MEETING" && meetingMeta.transcriptText
              ? "Transcript"
              : "Full content"}
        </h2>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "inherit",
            fontSize: "0.875rem",
            lineHeight: 1.6,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {communication.source === "WEBEX_MEETING" && meetingMeta.transcriptText
            ? meetingMeta.transcriptText
            : communication.source === "EMAIL" && internalCallMeta.transcriptText
              ? internalCallMeta.transcriptText
            : formattedBody || communication.excerpt || "(No content available)"}
        </pre>
      </section>

      {communication.source === "WEBEX_MEETING" &&
        (meetingMeta.gongSummaryText ||
          (meetingMeta.summaryText && meetingMeta.transcriptText)) && (
          <section
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "1.25rem",
              marginBottom: "1.25rem",
            }}
          >
            <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>
              {meetingMeta.gongSummaryText ? "Gong AI summary" : "Meeting summary"}
            </h2>
            {meetingMeta.gongSummaryText ? (
              <GongMeetingSummary
                text={meetingMeta.gongSummaryText}
                actionItems={meetingMeta.gongActionItems}
              />
            ) : (
              <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-muted)" }}>
                {meetingMeta.summaryText}
              </p>
            )}
          </section>
        )}

      {communication.source === "EMAIL" && emailMeta.questionSnippets?.length ? (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Questions detected
          </h2>
          <ul
            style={{
              paddingLeft: "1.1rem",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            {emailMeta.questionSnippets.map((snippet) => (
              <li key={snippet}>{snippet}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isFutureCalendar && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <EventPlanningTodos
            communicationId={communication.id}
            eventSubject={communication.subject ?? "this event"}
            suggestions={prepSuggestions}
            existingSteps={communication.nextSteps.map((step) => ({
              id: step.id,
              title: step.title,
              status: step.status,
            }))}
          />
        </section>
      )}

      {communication.nextSteps.length > 0 && !isFutureCalendar && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Linked next steps
          </h2>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {communication.nextSteps.map((step) => (
              <li
                key={step.id}
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  padding: "0.5rem 0.65rem",
                  background: "var(--bg)",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                }}
              >
                {step.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(meetingRecordingHref(meetingMeta) ||
        meetingMeta.transcriptDownloadUrl ||
        meetingMeta.webLink) && (
        <section style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <MeetingRecordingLinks metadata={meetingMeta} />
          {meetingMeta.transcriptDownloadUrl && (
            <a
              href={meetingMeta.transcriptDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.875rem", color: "var(--accent)" }}
            >
              Download transcript
            </a>
          )}
        </section>
      )}
    </main>
  );
}
