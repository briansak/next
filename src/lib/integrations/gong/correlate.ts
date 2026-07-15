import { prisma } from "@/lib/db";
import type { Priority, Prisma } from "@prisma/client";
import { scoreToPriority } from "@/lib/heuristics";
import {
  parseGongEmail,
  titleSimilarity,
  type GongEmailContent,
} from "@/lib/integrations/gong/email";
import {
  classifyInternalCall,
  type InternalCallClassification,
} from "@/lib/integrations/gong/internal-calls";
import type { ParsedEml } from "@/lib/integrations/email/eml";
import { MEETING_LOOKBACK_DAYS } from "@/lib/integrations/webex/meetings";

const MIN_TITLE_SIMILARITY = 0.55;
const GONG_MATCH_WINDOW_DAYS = 21;

export interface GongCorrelationResult {
  handled: boolean;
  correlated: boolean;
  internalCall?: boolean;
  meetingId?: string;
  meetingTitle?: string;
  reason?: string;
}

interface MeetingMetadata {
  meetingId?: string;
  summaryText?: string;
  summarySource?: string;
  gongSummaryText?: string;
  gongActionItems?: string[];
  gongEmailMessageIds?: string[];
  gongReceivedAt?: string;
  gongReplayUrl?: string;
  gongMeetingTitle?: string;
  internalCallType?: string;
  internalCallLabel?: string;
  summaryActionItems?: string[];
  actionItems?: Array<{
    title: string;
    assigneeUserIds?: string[];
    source?: string;
  }>;
  hasSummary?: boolean;
}

export function gongEmailCorrelationEnabled(): boolean {
  return process.env.ENABLE_GONG_EMAIL_CORRELATION !== "false";
}

export async function tryCorrelateGongEmail(
  tenantId: string,
  parsed: ParsedEml
): Promise<GongCorrelationResult> {
  if (!gongEmailCorrelationEnabled()) {
    return { handled: false, correlated: false };
  }

  const gong = parseGongEmail(parsed);
  if (!gong) {
    return { handled: false, correlated: false };
  }

  const internalCall = classifyInternalCall(gong.meetingTitle, gong.subject);
  const match = await findMatchingMeeting(tenantId, gong);

  if (match) {
    await attachGongSummaryToMeeting(tenantId, match.id, gong, internalCall);
    return {
      handled: true,
      correlated: true,
      internalCall: Boolean(internalCall),
      meetingId: match.id,
      meetingTitle: match.subject ?? gong.meetingTitle,
    };
  }

  if (internalCall) {
    const id = await ingestInternalCallFromGong(tenantId, gong, internalCall);
    return {
      handled: true,
      correlated: false,
      internalCall: true,
      meetingId: id,
      meetingTitle: gong.meetingTitle,
    };
  }

  return {
    handled: true,
    correlated: false,
    meetingTitle: gong.meetingTitle,
    reason: `No meeting matched "${gong.meetingTitle}"`,
  };
}

async function findMatchingMeeting(
  tenantId: string,
  gong: GongEmailContent
): Promise<{ id: string; subject: string | null; receivedAt: Date } | null> {
  const windowStart = new Date(gong.receivedAt);
  windowStart.setDate(windowStart.getDate() - GONG_MATCH_WINDOW_DAYS);

  const meetings = await prisma.communication.findMany({
    where: {
      tenantId,
      source: "WEBEX_MEETING",
      receivedAt: { gte: windowStart, lte: gong.receivedAt },
    },
    orderBy: { receivedAt: "desc" },
    take: 80,
    select: { id: true, subject: true, receivedAt: true },
  });

  let best: { id: string; subject: string | null; receivedAt: Date; score: number } | null =
    null;

  for (const meeting of meetings) {
    const title = meeting.subject ?? "";
    const similarity = titleSimilarity(gong.meetingTitle, title);
    if (similarity < MIN_TITLE_SIMILARITY) continue;

    const daysApart = Math.abs(
      (gong.receivedAt.getTime() - meeting.receivedAt.getTime()) /
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

async function attachGongSummaryToMeeting(
  tenantId: string,
  communicationId: string,
  gong: GongEmailContent,
  internalCall: InternalCallClassification | null
): Promise<void> {
  const existing = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      nextSteps: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { title: true },
      },
    },
  });
  if (!existing || existing.tenantId !== tenantId) return;

  const meta = (existing.metadata ?? {}) as MeetingMetadata;
  const processedIds = meta.gongEmailMessageIds ?? [];
  if (processedIds.includes(gong.messageId)) return;

  const gongActionItems = gong.actionItems;
  const hasGongSummary = gong.summary.length > 40;
  const primarySummary = meta.summaryText?.trim();
  const useGongAsPrimary = hasGongSummary && !primarySummary;

  const mergedActionItems = mergeActionItems(
    meta.actionItems ?? [],
    gongActionItems
  );

  const updatedMeta: MeetingMetadata = {
    ...meta,
    gongSummaryText: gong.summary || meta.gongSummaryText,
    gongActionItems: gongActionItems.length
      ? gongActionItems
      : meta.gongActionItems,
    gongEmailMessageIds: [...processedIds, gong.messageId],
    gongReceivedAt: gong.receivedAt.toISOString(),
    gongReplayUrl: gong.replayUrl ?? meta.gongReplayUrl,
    gongMeetingTitle: gong.meetingTitle,
    internalCallType: internalCall?.type ?? meta.internalCallType,
    internalCallLabel: internalCall?.label ?? meta.internalCallLabel,
    hasSummary: Boolean(primarySummary || hasGongSummary || meta.gongSummaryText),
    summaryText: useGongAsPrimary ? gong.summary : meta.summaryText,
    summarySource: useGongAsPrimary ? "gong" : meta.summarySource,
    summaryActionItems: mergedActionItems.map((item) => item.title),
    actionItems: mergedActionItems,
  };

  const tags = new Set(existing.tags);
  tags.add("meeting");
  tags.add("gong-summary");
  if (internalCall) tags.add("internal-call");
  if (internalCall) tags.add(internalCall.type);
  if (gongActionItems.length > 0) tags.add("action-required");
  if (useGongAsPrimary || hasGongSummary) tags.add("ai-summary");

  const reasons = [...existing.priorityReasons];
  if (!reasons.some((r) => r.includes("Gong"))) {
    reasons.push("Gong AI summary correlated from email");
  }
  if (internalCall && !reasons.some((r) => r.includes(internalCall.label))) {
    reasons.push(`${internalCall.label} replay available`);
  }

  let priorityScore = Math.min(10, existing.priorityScore + 2);
  const priority = scoreToPriority(priorityScore) as Priority;

  const excerpt =
    (useGongAsPrimary ? gong.summary : meta.gongSummaryText ?? primarySummary)?.slice(
      0,
      220
    ) ?? existing.excerpt;

  await prisma.communication.update({
    where: { id: communicationId },
    data: {
      excerpt,
      summary: useGongAsPrimary
        ? gong.summary.slice(0, 500)
        : existing.summary ?? gong.summary.slice(0, 500),
      priority,
      priorityScore,
      priorityReasons: reasons,
      tags: [...tags],
      metadata: updatedMeta as Prisma.InputJsonValue,
    },
  });

  await syncGongNextSteps(
    tenantId,
    communicationId,
    gongActionItems,
    priority,
    existing.nextSteps.map((s) => s.title)
  );
}

async function ingestInternalCallFromGong(
  tenantId: string,
  gong: GongEmailContent,
  internalCall: InternalCallClassification
): Promise<string> {
  const existing = await prisma.communication.findFirst({
    where: {
      tenantId,
      externalId: gong.messageId,
      source: "EMAIL",
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const hasSummary = gong.summary.length > 0;
  const communication = await prisma.communication.create({
    data: {
      tenantId,
      source: "EMAIL",
      externalId: gong.messageId,
      subject: gong.meetingTitle,
      body: gong.summary || gong.subject,
      excerpt: (gong.summary || gong.meetingTitle).slice(0, 220),
      summary: gong.summary.slice(0, 500),
      authorEmail: gong.fromAddress,
      receivedAt: gong.receivedAt,
      priority: "INFO",
      priorityScore: 2,
      priorityReasons: [`${internalCall.label} replay from Gong email`],
      tags: [
        "internal-call",
        internalCall.type,
        "gong-summary",
        ...(hasSummary ? ["ai-summary"] : []),
      ],
      metadata: {
        internalCallType: internalCall.type,
        internalCallLabel: internalCall.label,
        gongSummaryText: gong.summary,
        gongActionItems: gong.actionItems,
        gongReplayUrl: gong.replayUrl,
        gongMeetingTitle: gong.meetingTitle,
        gongEmailMessageIds: [gong.messageId],
        gongReceivedAt: gong.receivedAt.toISOString(),
        fromGongEmail: true,
        messageId: gong.messageId,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await syncGongNextSteps(tenantId, communication.id, gong.actionItems, "INFO", []);

  return communication.id;
}

function mergeActionItems(
  existing: Array<{ title: string; assigneeUserIds?: string[]; source?: string }>,
  gongItems: string[]
): Array<{ title: string; assigneeUserIds?: string[]; source?: string }> {
  const merged = [...existing];
  const seen = new Set(existing.map((item) => item.title.toLowerCase()));

  for (const title of gongItems) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    merged.push({ title, source: "gong" });
    seen.add(key);
  }

  return merged;
}

async function syncGongNextSteps(
  tenantId: string,
  communicationId: string,
  actionItems: string[],
  priority: Priority,
  existingTitles: string[]
): Promise<void> {
  const seen = new Set(existingTitles.map((t) => t.toLowerCase()));
  for (const title of actionItems) {
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    await prisma.nextStep.create({
      data: {
        tenantId,
        communicationId,
        title,
        priority,
        status: "OPEN",
      },
    });
    seen.add(key);
  }
}

export async function correlateGongEmailsForTenant(
  tenantId: string
): Promise<{ scanned: number; correlated: number; unmatched: number }> {
  const since = new Date();
  since.setDate(since.getDate() - MEETING_LOOKBACK_DAYS);

  const emails = await prisma.communication.findMany({
    where: {
      tenantId,
      source: "EMAIL",
      receivedAt: { gte: since },
      OR: [
        { tags: { has: "gong-summary" } },
        { authorEmail: { contains: "gong", mode: "insensitive" } },
        { subject: { contains: "gong", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      subject: true,
      body: true,
      authorEmail: true,
      receivedAt: true,
      metadata: true,
    },
  });

  let correlated = 0;
  let unmatched = 0;

  for (const email of emails) {
    const meta = (email.metadata ?? {}) as { messageId?: string };
    const parsed: ParsedEml = {
      messageId: meta.messageId ?? email.id,
      subject: email.subject ?? "",
      body: email.body ?? "",
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    };

    const result = await tryCorrelateGongEmail(tenantId, parsed);
    if (result.correlated) correlated++;
    else if (result.handled) unmatched++;
  }

  return { scanned: emails.length, correlated, unmatched };
}
