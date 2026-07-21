import { prisma } from "@/lib/db";
import { applyViewerMentionBoost } from "@/lib/heuristics";
import type { MentionUser } from "@/lib/heuristics/mentions";
import { applyViewerPriorityOverride } from "@/lib/communications/viewer-override";
import { isInternalCallCommunication } from "@/lib/communications/internal-call";
import {
  MEETING_LOOKBACK_DAYS,
  meetingVisibleToUser,
} from "@/lib/integrations/webex/meetings";
import {
  resolveUnifiedMeetingSummary,
  type UnifiedMeetingMetadata,
} from "@/lib/integrations/meetings/unify";
import type { DashboardSummary } from "@/lib/heuristics/dashboard-summary";
export { MEETING_LOOKBACK_DAYS };

export const USER_MEETINGS_PANEL_TITLE = "Meetings you joined";

interface MeetingActionItem {
  title: string;
  assigneeUserIds?: string[];
  source?: string;
}

export interface UserMeetingMetadata extends UnifiedMeetingMetadata {
  relevantUserEmails?: string[];
  connectedAccountEmails?: string[];
  inviteeEmails?: string[];
  participantEmails?: string[];
  mentionedUserIds?: string[];
  transcriptSource?: "webex" | "whisper" | "gong" | "none";
  transcriptDownloadUrl?: string;
  recordingId?: string;
  webLink?: string;
  hostEmail?: string;
  hostDisplayName?: string;
  hasRecording?: boolean;
  hasSummary?: boolean;
  hasTranscription?: boolean;
  transcriptText?: string;
}

export interface UserMeetingEntry {
  id: string;
    subject: string | null;
  authorName: string | null;
  receivedAt: Date;
  excerpt: string | null;
  summary: string | null;
  body: string;
  metadata: unknown;
  priority: string;
  priorityScore: number;
  score: number;
  mentionedYou: boolean;
}

export function meetingActionItems(meta: UserMeetingMetadata): MeetingActionItem[] {
  if (meta.actionItems?.length) {
    return meta.actionItems.map((item) => ({
      title: item.title,
      assigneeUserIds: item.assigneeUserIds,
      source: item.source,
    }));
  }
  if (meta.summaryActionItems?.length) {
    return meta.summaryActionItems.map((title) => ({ title }));
  }
  return (meta.gongActionItems ?? []).map((title) => ({ title, source: "gong" }));
}

export function resolveMeetingCardSummary(
  meeting: { summary: string | null; excerpt: string | null },
  meta: UserMeetingMetadata,
  cardSummary?: DashboardSummary
): { text: string | null; source: string | null; label: string | null } {
  const unified = resolveUnifiedMeetingSummary(meta, meeting.summary);
  if (unified) {
    return { text: unified.text, source: unified.source, label: unified.label };
  }

  const cardText = cardSummary?.text?.trim();
  if (cardText && cardSummary) {
    return {
      text: cardText,
      source: cardSummary.source ?? null,
      label: cardSummary.label ?? null,
    };
  }

  return { text: null, source: null, label: null };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchRecentWebexMeetings() {
  return prisma.communication
    .findMany({
      where: {
        source: "WEBEX_MEETING",
        receivedAt: { gte: daysAgo(MEETING_LOOKBACK_DAYS) },
      },
      orderBy: [{ receivedAt: "desc" }],
      take: 40,
    })
    .catch(() => []);
}

function processUserMeetings(
  rawMeetings: Awaited<ReturnType<typeof fetchRecentWebexMeetings>>,
  options: {
    userId: string;
    userEmail: string;
    viewer: MentionUser;
    limit?: number;
    hiddenCommunicationIds?: string[];
  }
): UserMeetingEntry[] {
  const {
    userId,
    userEmail,
    viewer,
    limit = 8,
    hiddenCommunicationIds,
  } = options;

  return rawMeetings
    .filter((m) =>
      meetingVisibleToUser((m.metadata ?? {}) as UserMeetingMetadata, userEmail, true)
    )
    .filter(
      (m) =>
        !isInternalCallCommunication(m.source, m.subject, m.tags, m.metadata)
    )
    .map((m) => {
      const meta = (m.metadata ?? {}) as UserMeetingMetadata;
      const boosted = applyViewerMentionBoost(
        m.priorityScore,
        meta.mentionedUserIds,
        userId,
        {
          text: [m.subject, m.body, m.summary, m.excerpt].filter(Boolean).join("\n"),
          viewer,
        }
      );
      const yourAction = meetingActionItems(meta).some((item) =>
        item.assigneeUserIds?.includes(userId)
      );
      let score = boosted.score;
      if (yourAction) score = Math.min(10, score + 2);

      const overrideApplied = applyViewerPriorityOverride(
        score,
        m.priority,
        m.metadata,
        userId,
        { communicationId: m.id, hiddenCommunicationIds }
      );

      return {
        id: m.id,
        subject: m.subject,
        authorName: m.authorName,
        receivedAt: m.receivedAt,
        excerpt: m.excerpt,
        summary: m.summary,
        body: m.body,
        metadata: m.metadata,
        priority: overrideApplied.priority,
        priorityScore: m.priorityScore,
        score: overrideApplied.score,
        mentionedYou: boosted.mentionedYou || yourAction,
        hidden: overrideApplied.hidden,
      };
    })
    .filter((m) => !m.hidden)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.priorityScore - a.priorityScore ||
        b.receivedAt.getTime() - a.receivedAt.getTime()
    )
    .slice(0, limit)
    .map(({ hidden: _hidden, ...meeting }) => meeting);
}

export async function loadUserMeetings(options: {
  userId: string;
  userEmail: string;
  viewer: MentionUser;
  limit?: number;
}): Promise<UserMeetingEntry[]> {
  const rawMeetings = await fetchRecentWebexMeetings();
  return processUserMeetings(rawMeetings, options);
}

export async function loadUserMeetingsContext(options: {
  userId: string;
  userEmail: string;
  viewer: MentionUser;
  limit?: number;
  hiddenCommunicationIds?: string[];
}) {
  const rawMeetings = await fetchRecentWebexMeetings();
  return {
    rawMeetings,
    meetings: processUserMeetings(rawMeetings, options),
  };
}

export function toUserMeetingSummaryItem(meeting: UserMeetingEntry) {
  return {
    id: meeting.id,
    source: "WEBEX_MEETING" as const,
    subject: meeting.subject,
    body: meeting.body,
    excerpt: meeting.excerpt,
    summary: meeting.summary,
    authorName: meeting.authorName,
    metadata: meeting.metadata,
  };
}
