import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getAppConfig } from "@/lib/config/app-config-store";
import { getFirstUserId } from "@/lib/user/profile";
import {
  parseGongEmail,
  type GongEmailContent,
} from "@/lib/integrations/gong/email";
import {
  classifyInternalCall,
  type InternalCallClassification,
} from "@/lib/integrations/gong/internal-calls";
import type { ParsedEml } from "@/lib/integrations/email/eml";
import { MEETING_LOOKBACK_DAYS } from "@/lib/integrations/webex/meetings";
import {
  attachGongSourceToMeeting,
  findMatchingWebexMeeting,
} from "@/lib/integrations/meetings/unify";
import { buildHeuristicTranscriptSummary } from "@/lib/heuristics/transcript-summary";

export interface GongCorrelationResult {
  handled: boolean;
  correlated: boolean;
  internalCall?: boolean;
  meetingId?: string;
  meetingTitle?: string;
  reason?: string;
}

export function gongEmailCorrelationEnabled(): boolean {
  return process.env.ENABLE_GONG_EMAIL_CORRELATION !== "false";
}

export async function gongEmailCorrelationEnabledForApp(): Promise<boolean> {
  const userId = await getFirstUserId();
  if (!userId) return gongEmailCorrelationEnabled();
  const config = await getAppConfig(userId);
  return config.enableGongEmailCorrelation;
}

export async function tryCorrelateGongEmail(
  parsed: ParsedEml
): Promise<GongCorrelationResult> {
  if (!(await gongEmailCorrelationEnabledForApp())) {
    return { handled: false, correlated: false };
  }

  const gong = parseGongEmail(parsed);
  if (!gong) {
    return { handled: false, correlated: false };
  }

  const internalCall = classifyInternalCall(gong.meetingTitle, gong.subject);
  const match = await findMatchingWebexMeeting({
    meetingTitle: gong.meetingTitle,
    receivedAt: gong.receivedAt,
  });

  if (match) {
    await attachGongSourceToMeeting(match.id, {
      messageId: gong.messageId,
      meetingTitle: gong.meetingTitle,
      summary: gong.summary,
      transcript: gong.transcript,
      actionItems: gong.actionItems,
      replayUrl: gong.replayUrl ?? undefined,
      receivedAt: gong.receivedAt,
      internalCallType: internalCall?.type,
      internalCallLabel: internalCall?.label,
    });
    return {
      handled: true,
      correlated: true,
      internalCall: Boolean(internalCall),
      meetingId: match.id,
      meetingTitle: match.subject ?? gong.meetingTitle,
    };
  }

  if (internalCall) {
    const id = await ingestInternalCallFromGong(gong, internalCall);
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

async function ingestInternalCallFromGong(
  gong: GongEmailContent,
  internalCall: InternalCallClassification
): Promise<string> {
  const existing = await prisma.communication.findFirst({
    where: {
      externalId: gong.messageId,
      source: "EMAIL",
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const hasSummary = gong.summary.length > 0 || gong.transcript.length >= 120;
  const summaryText =
    gong.summary.length >= 80
      ? gong.summary
      : gong.transcript.length >= 120
        ? buildHeuristicTranscriptSummary(gong.meetingTitle, gong.transcript).text
        : gong.summary;
  const communication = await prisma.communication.create({
    data: {
      source: "EMAIL",
      externalId: gong.messageId,
      subject: gong.meetingTitle,
      body: gong.summary || gong.transcript || gong.subject,
      excerpt: (summaryText || gong.meetingTitle).slice(0, 220),
      summary: summaryText.slice(0, 500),
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
        gongSummaryText: summaryText || gong.summary,
        gongTranscriptText: gong.transcript || undefined,
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

  for (const title of gong.actionItems) {
    await prisma.nextStep.create({
      data: {
        communicationId: communication.id,
        title,
        priority: "INFO",
        status: "OPEN",
      },
    });
  }

  return communication.id;
}

export async function correlateGongEmails(): Promise<{
  scanned: number;
  correlated: number;
  unmatched: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - MEETING_LOOKBACK_DAYS);

  const emails = await prisma.communication.findMany({
    where: {
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

    const result = await tryCorrelateGongEmail(parsed);
    if (result.correlated) correlated++;
    else if (result.handled) unmatched++;
  }

  return { scanned: emails.length, correlated, unmatched };
}

/** @deprecated Use correlateGongEmails */
export const correlateGongEmailsForTenant = correlateGongEmails;

/** @deprecated Use gongEmailCorrelationEnabledForApp */
export const gongEmailCorrelationEnabledForTenant = gongEmailCorrelationEnabledForApp;
