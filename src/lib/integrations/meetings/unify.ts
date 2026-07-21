import { prisma } from "@/lib/db";
import type { Priority, Prisma } from "@prisma/client";
import { mergeCommunicationMetadata } from "@/lib/communications/viewer-override";
import { scoreToPriority } from "@/lib/heuristics";
import { buildHeuristicTranscriptSummary } from "@/lib/heuristics/transcript-summary";
import { titleSimilarity } from "@/lib/integrations/gong/email";
import type { UnifiedMeetingMetadata } from "./unify-summary";

export {
  meetingHasRecording,
  meetingSourceBadges,
  resolveMeetingTranscriptText,
  resolveUnifiedMeetingSummary,
  unifiedMeetingReplayUrl,
  type MeetingSourceBadge,
  type MeetingSourceKind,
  type UnifiedMeetingMetadata,
} from "./unify-summary";

export async function findMatchingWebexMeeting(
    input: MeetingMatchInput
): Promise<{ id: string; subject: string | null; receivedAt: Date } | null> {
  const windowStart = new Date(input.receivedAt);
  windowStart.setDate(windowStart.getDate() - MEETING_MATCH_WINDOW_DAYS);

  const meetings = await prisma.communication.findMany({
    where: {
      source: "WEBEX_MEETING",
      receivedAt: { gte: windowStart, lte: input.receivedAt },
    },
    orderBy: { receivedAt: "desc" },
    take: 80,
    select: { id: true, subject: true, receivedAt: true },
  });

  let best: { id: string; subject: string | null; receivedAt: Date; score: number } | null =
    null;

  for (const meeting of meetings) {
    const similarity = titleSimilarity(
      input.meetingTitle,
      meeting.subject ?? ""
    );
    if (similarity < MIN_TITLE_SIMILARITY) continue;

    const daysApart = Math.abs(
      (input.receivedAt.getTime() - meeting.receivedAt.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const recencyBoost = daysApart <= 3 ? 0.08 : daysApart <= 7 ? 0.04 : 0;
    const score = similarity + recencyBoost;

    if (!best || score > best.score) {
      best = { ...meeting, score };
    }
  }

  return best;
}

function mergeActionItems(
  existing: Array<{ title: string; assigneeUserIds?: string[]; source?: string }>,
  incoming: string[],
  source: string
): Array<{ title: string; assigneeUserIds?: string[]; source?: string }> {
  const merged = [...existing];
  const seen = new Set(existing.map((item) => item.title.toLowerCase()));

  for (const title of incoming) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    merged.push({ title, source });
    seen.add(key);
  }

  return merged;
}

async function syncMeetingNextSteps(
    communicationId: string,
  actionItems: string[],
  priority: Priority,
  existingTitles: string[]
): Promise<void> {
  const seen = new Set(existingTitles.map((title) => title.toLowerCase()));
  for (const title of actionItems) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    await prisma.nextStep.create({
      data: {
        communicationId,
        title,
        priority,
        status: "OPEN",
      },
    });
    seen.add(key);
  }
}

export async function attachGongSourceToMeeting(
    communicationId: string,
  input: {
    messageId: string;
    meetingTitle: string;
    summary: string;
    transcript?: string;
    actionItems: string[];
    replayUrl?: string;
    receivedAt: Date;
    internalCallType?: string;
    internalCallLabel?: string;
  }
): Promise<boolean> {
  const existing = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      nextSteps: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { title: true },
      },
    },
  });
  if (!existing || false) return false;

  const meta = (existing.metadata ?? {}) as UnifiedMeetingMetadata;
  const processedIds = meta.gongEmailMessageIds ?? [];
  if (processedIds.includes(input.messageId)) return true;

  const hasGongSummary = input.summary.length > 40;
  const gongTranscript = input.transcript?.trim() || meta.gongTranscriptText?.trim() || "";
  let gongSummary = input.summary || meta.gongSummaryText || "";

  if (gongSummary.length < 80 && gongTranscript.length >= 120) {
    const heuristic = buildHeuristicTranscriptSummary(input.meetingTitle, gongTranscript);
    if (heuristic.text.length > gongSummary.length) {
      gongSummary = heuristic.text;
    }
  }

  const primarySummary = meta.summaryText?.trim();
  const useGongAsPrimary = gongSummary.length > 40 && !primarySummary;
  const mergedActionItems = mergeActionItems(
    meta.actionItems ?? [],
    input.actionItems,
    "gong"
  );

  const updatedMeta: UnifiedMeetingMetadata = {
    ...meta,
    gongSummaryText: gongSummary || meta.gongSummaryText,
    gongTranscriptText: gongTranscript || meta.gongTranscriptText,
    gongActionItems: input.actionItems.length ? input.actionItems : meta.gongActionItems,
    gongEmailMessageIds: [...processedIds, input.messageId],
    gongReceivedAt: input.receivedAt.toISOString(),
    gongReplayUrl: input.replayUrl ?? meta.gongReplayUrl,
    gongMeetingTitle: input.meetingTitle,
    internalCallType: input.internalCallType ?? meta.internalCallType,
    internalCallLabel: input.internalCallLabel ?? meta.internalCallLabel,
    hasSummary: Boolean(primarySummary || gongSummary || meta.gongSummaryText),
    summaryText: useGongAsPrimary ? gongSummary : meta.summaryText,
    summarySource: useGongAsPrimary ? "gong" : meta.summarySource,
    summaryActionItems: mergedActionItems.map((item) => item.title),
    actionItems: mergedActionItems,
  };

  return applyMeetingUnificationUpdate(existing, updatedMeta, {
    reason: "Gong AI summary correlated from email",
    tags: ["gong-summary", ...(input.internalCallType ? ["internal-call", input.internalCallType] : [])],
    excerpt: (useGongAsPrimary ? gongSummary : meta.gongSummaryText ?? primarySummary)?.slice(0, 220),
    summary: useGongAsPrimary
      ? gongSummary.slice(0, 500)
      : existing.summary ?? gongSummary.slice(0, 500),
    actionItems: input.actionItems,
    nextStepTitles: existing.nextSteps.map((step) => step.title),
  });
}

export async function attachReplaySourceToMeeting(
    communicationId: string,
  input: {
    messageId: string;
    meetingTitle: string;
    summary: string;
    actionItems: string[];
    replayUrl?: string;
    replayPlatform?: string;
    summarySource?: string;
    callHighlights?: Array<{
      timestamp: string;
      startSeconds: number;
      title: string;
      description: string;
    }>;
    vidcastShareId?: string;
    vidcastVideoId?: string;
    vidcastShareUrl?: string;
    replayBridgeUrl?: string;
    transcriptText?: string;
    receivedAt: Date;
    internalCallType?: string;
    internalCallLabel?: string;
  }
): Promise<boolean> {
  const existing = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      nextSteps: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { title: true },
      },
    },
  });
  if (!existing || false) return false;

  const meta = (existing.metadata ?? {}) as UnifiedMeetingMetadata;
  const processedIds = meta.replayEmailMessageIds ?? [];
  if (processedIds.includes(input.messageId)) return true;

  const hasReplaySummary = input.summary.length > 40;
  const primarySummary = meta.summaryText?.trim() ?? meta.gongSummaryText?.trim();
  const useReplayAsPrimary = hasReplaySummary && !primarySummary;
  const mergedActionItems = mergeActionItems(
    meta.actionItems ?? [],
    input.actionItems,
    "replay"
  );

  const updatedMeta: UnifiedMeetingMetadata = {
    ...meta,
    replaySummaryText: input.summary || meta.replaySummaryText,
    replayEmailMessageIds: [...processedIds, input.messageId],
    replayReceivedAt: input.receivedAt.toISOString(),
    replayUrl: input.replayUrl ?? meta.replayUrl,
    replayPlatform: input.replayPlatform ?? meta.replayPlatform,
    replaySummarySource: input.summarySource ?? meta.replaySummarySource,
    vidcastShareId: input.vidcastShareId ?? meta.vidcastShareId,
    vidcastVideoId: input.vidcastVideoId ?? meta.vidcastVideoId,
    vidcastShareUrl: input.vidcastShareUrl ?? meta.vidcastShareUrl,
    replayBridgeUrl: input.replayBridgeUrl ?? meta.replayBridgeUrl,
    callHighlights:
      input.callHighlights && input.callHighlights.length > 0
        ? input.callHighlights
        : meta.callHighlights,
    transcriptText: input.transcriptText ?? meta.transcriptText,
    gongReplayUrl: input.replayUrl ?? meta.gongReplayUrl,
    gongMeetingTitle: input.meetingTitle,
    internalCallType: input.internalCallType ?? meta.internalCallType,
    internalCallLabel: input.internalCallLabel ?? meta.internalCallLabel,
    hasSummary: Boolean(primarySummary || hasReplaySummary || meta.replaySummaryText),
    summaryText: useReplayAsPrimary ? input.summary : meta.summaryText,
    summarySource: useReplayAsPrimary ? "replay" : meta.summarySource,
    summaryActionItems: mergedActionItems.map((item) => item.title),
    actionItems: mergedActionItems,
  };

  return applyMeetingUnificationUpdate(existing, updatedMeta, {
    reason: "Replay notification correlated to calendar meeting",
    tags: ["replay-email", ...(input.internalCallType ? ["internal-call", input.internalCallType] : [])],
    excerpt: (useReplayAsPrimary ? input.summary : meta.replaySummaryText ?? primarySummary)?.slice(
      0,
      220
    ),
    summary: useReplayAsPrimary
      ? input.summary.slice(0, 500)
      : existing.summary ?? input.summary.slice(0, 500),
    actionItems: input.actionItems,
    nextStepTitles: existing.nextSteps.map((step) => step.title),
  });
}

async function applyMeetingUnificationUpdate(
  existing: {
    id: string;
    excerpt: string | null;
    summary: string | null;
    priorityScore: number;
    priorityReasons: string[];
    tags: string[];
    metadata: unknown;
  },
  updatedMeta: UnifiedMeetingMetadata,
  patch: {
    reason: string;
    tags: string[];
    excerpt?: string;
    summary?: string;
    actionItems: string[];
    nextStepTitles: string[];
  }
): Promise<boolean> {
  const tags = new Set(existing.tags);
  tags.add("meeting");
  tags.add("unified-meeting");
  for (const tag of patch.tags) tags.add(tag);
  if (patch.actionItems.length > 0) tags.add("action-required");
  if (updatedMeta.summaryText || updatedMeta.gongSummaryText || updatedMeta.replaySummaryText) {
    tags.add("ai-summary");
  }

  const reasons = [...existing.priorityReasons];
  if (!reasons.some((reason) => reason.includes(patch.reason))) {
    reasons.push(patch.reason);
  }

  const priorityScore = Math.min(10, existing.priorityScore + 2);
  const priority = scoreToPriority(priorityScore) as Priority;

  await prisma.communication.update({
    where: { id: existing.id },
    data: {
      excerpt: patch.excerpt ?? existing.excerpt,
      summary: patch.summary ?? existing.summary,
      priority,
      priorityScore,
      priorityReasons: reasons,
      tags: [...tags],
      metadata: mergeCommunicationMetadata(
        existing.metadata,
        updatedMeta as Record<string, unknown>
      ) as Prisma.InputJsonValue,
    },
  });

  await syncMeetingNextSteps(
    existing.id,
    patch.actionItems,
    priority,
    patch.nextStepTitles
  );

  return true;
}

export const MIN_TITLE_SIMILARITY = 0.55;
export const MEETING_MATCH_WINDOW_DAYS = 21;

export interface MeetingMatchInput {
  meetingTitle: string;
  receivedAt: Date;
}
