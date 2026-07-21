import { CardAiSummary } from "@/components/card-ai-summary";
import { DashboardCardLink } from "@/components/dashboard-card-link";
import { AttentionChip, formatRelativeAge } from "@/components/dashboard-ui";
import { MeetingRecordingLinks } from "@/components/meeting-recording-links";
import { PageSection } from "@/components/ui/page-shell";
import { Panel } from "@/components/ui/panel";
import type { MentionUser } from "@/lib/heuristics/mentions";
import { resolveDashboardSummaries } from "@/lib/heuristics/dashboard-summary";
import { meetingRecordingHref } from "@/lib/integrations/webex/meetings";
import {
  loadUserMeetings,
  meetingActionItems,
  MEETING_LOOKBACK_DAYS,
  resolveMeetingCardSummary,
  toUserMeetingSummaryItem,
  USER_MEETINGS_PANEL_TITLE,
  type UserMeetingMetadata,
} from "@/lib/meetings/user-meetings";
import {
  getUserPreferences,
  resolveAllowOllamaForUi,
} from "@/lib/user/preferences";

interface UserMeetingsPanelProps {
  userId: string;
  userEmail: string;
  viewer: MentionUser;
  allowOllamaSummaries: boolean;
}

export async function UserMeetingsPanel({
  userId,
  userEmail,
  viewer,
  allowOllamaSummaries,
}: UserMeetingsPanelProps) {
  const meetings = await loadUserMeetings({
    userId,
    userEmail,
    viewer,
  });

  if (meetings.length === 0) {
    return null;
  }

  const memberPreferences = await getUserPreferences(userId);
  const allowOllama = resolveAllowOllamaForUi({
    allowOllamaSummaries,
    ollamaAvailable: memberPreferences.ollamaAvailable,
  });

  const summaryMap = await resolveDashboardSummaries(
    meetings.map(toUserMeetingSummaryItem),
    {
      maxGenerations: allowOllama ? meetings.length : 0,
      allowOllama,
    }
  );

  return (
    <PageSection>
      <Panel title={USER_MEETINGS_PANEL_TITLE} count={meetings.length}>
        <p className="text-sm text-muted" style={{ marginBottom: "var(--space-4)" }}>
          Webex meetings from your calendar in the last {MEETING_LOOKBACK_DAYS} days —
          recordings, transcripts, and action items.
        </p>
        <ul className="list-stack">
          {meetings.map((m) => {
            const meta = (m.metadata ?? {}) as UserMeetingMetadata;
            const cardSummary = summaryMap.get(m.id);
            const { text: summary, source: summarySource, label: summaryLabel } =
              resolveMeetingCardSummary(m, meta, cardSummary);
            const actionItems = meetingActionItems(meta).slice(0, 2);
            const recordingHref = meetingRecordingHref(meta);

            return (
              <li key={m.id}>
                <DashboardCardLink
                  id={m.id}
                  highlighted={m.mentionedYou}
                  priority={m.priority}
                  footer={
                    recordingHref || meta.webLink ? (
                      <MeetingRecordingLinks metadata={meta} size="sm" />
                    ) : undefined
                  }
                >
                  <div className="card__meta">
                    <div className="card__meta-start">
                      {m.mentionedYou ? (
                        <AttentionChip label="Action assigned to you" />
                      ) : null}
                    </div>
                    <span className="card__timestamp">{formatRelativeAge(m.receivedAt)}</span>
                  </div>
                  <p className="card__title">{m.subject ?? "Meeting"}</p>
                  <CardAiSummary
                    text={
                      summary ??
                      (meta.transcriptText?.trim()
                        ? "Transcript available — open for summary."
                        : meta.hasRecording
                          ? "Recording available — open for details."
                          : m.excerpt ?? "Open for meeting details.")
                    }
                    label={summaryLabel}
                    source={summarySource}
                    variant={summary ? "full" : "teaser"}
                    showAllTakeaways={summarySource === "gong"}
                  />
                  {summary && actionItems.length > 0 ? (
                    <p className="text-xs text-muted" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                      {actionItems.length} action item{actionItems.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </DashboardCardLink>
              </li>
            );
          })}
        </ul>
      </Panel>
    </PageSection>
  );
}
