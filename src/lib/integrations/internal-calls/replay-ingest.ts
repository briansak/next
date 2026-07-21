import { mergeCommunicationMetadata } from "@/lib/communications/viewer-override";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { EmailMessage } from "@/lib/integrations/email/allowlist";
import {
  classifyInternalCall,
  INTERNAL_CALL_LOOKBACK_DAYS,
} from "@/lib/integrations/gong/internal-calls";
import { enrichReplaySummary, isShallowReplaySummary } from "./replay-enrich";
import { parseReplayEmail, type ReplayEmailContent } from "./replay-email";
import { looksLikeEncodedEmailBody } from "../../integrations/email/body-text";
import {
  attachReplaySourceToMeeting,
  findMatchingWebexMeeting,
} from "@/lib/integrations/meetings/unify";

export interface ReplayIngestResult {
  handled: boolean;
  created: boolean;
  upgraded?: boolean;
  id?: string;
}

export async function tryIngestReplayEmail(
    parsed: EmailMessage
): Promise<ReplayIngestResult> {
  const replay = parseReplayEmail(parsed);
  if (!replay) {
    return { handled: false, created: false };
  }

  const classification = classifyInternalCall(
    replay.meetingTitle,
    replay.subject,
    replay.bodyText
  );

  if (classification) {
    const enriched = await enrichReplaySummary(replay, {});
    const match = await findMatchingWebexMeeting( {
      meetingTitle: replay.meetingTitle,
      receivedAt: replay.receivedAt,
    });

    if (match) {
      const attached = await attachReplaySourceToMeeting( match.id, {
        messageId: replay.messageId,
        meetingTitle: replay.meetingTitle,
        summary: enriched.summary,
        actionItems: enriched.actionItems,
        replayUrl: enriched.vidcastShareUrl ?? replay.replayUrl ?? undefined,
        replayPlatform: enriched.vidcastShareUrl ? "vidcast" : replay.replayPlatform ?? undefined,
        summarySource: enriched.source,
        callHighlights: enriched.callHighlights,
        vidcastShareId: enriched.vidcastShareId,
        vidcastVideoId: enriched.vidcastVideoId,
        vidcastShareUrl: enriched.vidcastShareUrl,
        replayBridgeUrl: enriched.replayBridgeUrl,
        transcriptText: enriched.transcriptText,
        receivedAt: replay.receivedAt,
        internalCallType: classification.type,
        internalCallLabel: classification.label,
      });

      if (attached) {
        return {
          handled: true,
          created: false,
          upgraded: true,
          id: match.id,
        };
      }
    }
  }

  const existing = await prisma.communication.findFirst({
    where: {
      externalId: replay.messageId,
      source: "EMAIL",
    },
    select: { id: true, tags: true },
  });

  if (existing?.tags.includes("internal-call")) {
    return { handled: true, created: false, id: existing.id };
  }

  const id = await upsertInternalCallReplay(
    replay,
    existing?.id
  );

  return {
    handled: true,
    created: !existing,
    upgraded: Boolean(existing),
    id,
  };
}

async function upsertInternalCallReplay(
    replay: ReplayEmailContent,
  existingId?: string
): Promise<string> {
  const classification = classifyInternalCall(
    replay.meetingTitle,
    replay.subject,
    replay.bodyText
  );
  if (!classification) {
    throw new Error(`Replay email failed internal call classification: ${replay.subject}`);
  }

  const enriched = await enrichReplaySummary(replay, {});

  let existingMetadata: unknown;
  if (existingId) {
    const existing = await prisma.communication.findUnique({
      where: { id: existingId },
      select: { metadata: true },
    });
    existingMetadata = existing?.metadata;
  }

  const metadata = mergeCommunicationMetadata(existingMetadata, {
    internalCallType: classification.type,
    internalCallLabel: classification.label,
    fromReplayEmail: true,
    replayUrl: enriched.vidcastShareUrl ?? replay.replayUrl,
    replayPlatform: enriched.vidcastShareUrl ? "vidcast" : replay.replayPlatform,
    gongSummaryText: enriched.summary,
    gongReplayUrl: enriched.vidcastShareUrl ?? replay.replayUrl,
    gongMeetingTitle: replay.meetingTitle,
    gongActionItems: enriched.actionItems,
    replaySummarySource: enriched.source,
    callHighlights: enriched.callHighlights,
    vidcastShareId: enriched.vidcastShareId,
    vidcastVideoId: enriched.vidcastVideoId,
    vidcastShareUrl: enriched.vidcastShareUrl,
    replayBridgeUrl: enriched.replayBridgeUrl,
    transcriptText: enriched.transcriptText,
    messageId: replay.messageId,
  });

  const data = {
    subject: replay.meetingTitle,
    body: replay.bodyText || replay.summary,
    excerpt: enriched.summary.slice(0, 220),
    summary: enriched.summary.slice(0, 2000),
    authorEmail: replay.fromAddress,
    receivedAt: replay.receivedAt,
    priority: "INFO" as const,
    priorityScore: 2,
    priorityReasons: [`${classification.label} replay notification`],
    tags: [
      "internal-call",
      "replay-email",
      classification.type,
      ...(enriched.source !== "email" ? ["ai-summary"] : []),
    ],
    metadata: metadata as Prisma.InputJsonValue,
  };

  if (existingId) {
    const updated = await prisma.communication.update({
      where: { id: existingId },
      data,
      select: { id: true },
    });
    return updated.id;
  }

  const communication = await prisma.communication.create({
    data: {
      source: "EMAIL",
      externalId: replay.messageId,
      ...data,
    },
    select: { id: true },
  });

  return communication.id;
}

export interface BackfillInternalCallsResult {
  scanned: number;
  ingested: number;
  upgraded: number;
  skipped: number;
  refreshed?: number;
}

export async function backfillInternalCallReplays(
  ): Promise<BackfillInternalCallsResult> {
  const since = new Date();
  since.setDate(since.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  const emails = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      receivedAt: { gte: since },
      NOT: { tags: { has: "internal-call" } },
      OR: [
        { subject: { startsWith: "Replay:", mode: "insensitive" } },
        { subject: { startsWith: "Recording:", mode: "insensitive" } },
        { subject: { contains: "replay", mode: "insensitive" } },
        { body: { contains: "catch the replay", mode: "insensitive" } },
        { body: { contains: "check out the replay", mode: "insensitive" } },
        { body: { contains: "watch the replay", mode: "insensitive" } },
        { body: { contains: "what's the story", mode: "insensitive" } },
        { body: { contains: "on the bridge", mode: "insensitive" } },
        { body: { contains: "latest on our portfolio", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      authorEmail: true,
      receivedAt: true,
    },
    take: 200,
    orderBy: { receivedAt: "desc" },
  });

  let ingested = 0;
  let upgraded = 0;
  let skipped = 0;

  for (const email of emails) {
    const replay = parseReplayEmail({
      messageId: email.externalId,
      subject: email.subject ?? "",
      body: email.body,
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!replay) {
      skipped++;
      continue;
    }

    try {
      const id = await upsertInternalCallReplay( replay, email.id);
      if (id === email.id) upgraded++;
      else ingested++;
    } catch {
      skipped++;
    }
  }

  const encodedRefresh = await refreshEncodedInternalCalls();
  const summaryRefresh = await refreshLongInternalCallSummaries();
  const replayUrlRefresh = await refreshMissingReplayUrls();
  const vidcastRefresh = await refreshVidcastReplaySummaries();

  return {
    scanned: emails.length,
    ingested,
    upgraded,
    skipped,
    refreshed:
      encodedRefresh.refreshed +
      summaryRefresh.refreshed +
      replayUrlRefresh.refreshed +
      vidcastRefresh.refreshed,
  };
}

async function refreshEncodedInternalCalls(
  ): Promise<{ refreshed: number }> {
  const since = new Date();
  since.setDate(since.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  const internalCalls = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      tags: { has: "internal-call" },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      summary: true,
      authorEmail: true,
      receivedAt: true,
    },
    take: 100,
    orderBy: { receivedAt: "desc" },
  });

  let refreshed = 0;

  for (const email of internalCalls) {
    if (
      !looksLikeEncodedEmailBody(email.body) &&
      !looksLikeEncodedEmailBody(email.summary ?? "")
    ) {
      continue;
    }

    const replay = parseReplayEmail({
      messageId: email.externalId,
      subject: email.subject ?? "",
      body: email.body,
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!replay) continue;

    try {
      await upsertInternalCallReplay( replay, email.id);
      refreshed++;
    } catch {
      /* skip */
    }
  }

  return { refreshed };
}

async function refreshLongInternalCallSummaries(
  ): Promise<{ refreshed: number }> {
  const since = new Date();
  since.setDate(since.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  const internalCalls = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      tags: { has: "internal-call" },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      summary: true,
      authorEmail: true,
      receivedAt: true,
      metadata: true,
    },
    take: 100,
    orderBy: { receivedAt: "desc" },
  });

  let refreshed = 0;

  for (const email of internalCalls) {
    const meta = (email.metadata ?? {}) as { gongSummaryText?: string };
    const currentSummary = meta.gongSummaryText ?? email.summary ?? "";
    if (currentSummary.length < 280 || currentSummary.includes("\n- ")) {
      continue;
    }

    const replay = parseReplayEmail({
      messageId: email.externalId,
      subject: email.subject ?? "",
      body: email.body,
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!replay) continue;

    try {
      await upsertInternalCallReplay( replay, email.id);
      refreshed++;
    } catch {
      /* skip */
    }
  }

  return { refreshed };
}

async function refreshMissingReplayUrls(
  ): Promise<{ refreshed: number }> {
  const since = new Date();
  since.setDate(since.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  const internalCalls = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      tags: { has: "internal-call" },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      authorEmail: true,
      receivedAt: true,
      metadata: true,
    },
    take: 100,
    orderBy: { receivedAt: "desc" },
  });

  let refreshed = 0;

  for (const email of internalCalls) {
    const meta = (email.metadata ?? {}) as { replayUrl?: string | null };
    if (meta.replayUrl) continue;

    const replay = parseReplayEmail({
      messageId: email.externalId,
      subject: email.subject ?? "",
      body: email.body,
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!replay?.replayUrl) continue;

    try {
      await upsertInternalCallReplay( replay, email.id);
      refreshed++;
    } catch {
      /* skip */
    }
  }

  return { refreshed };
}

async function refreshVidcastReplaySummaries(
  ): Promise<{ refreshed: number }> {
  const since = new Date();
  since.setDate(since.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  const internalCalls = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      tags: { has: "internal-call" },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      summary: true,
      authorEmail: true,
      receivedAt: true,
      metadata: true,
    },
    take: 100,
    orderBy: { receivedAt: "desc" },
  });

  let refreshed = 0;

  for (const email of internalCalls) {
    const meta = (email.metadata ?? {}) as {
      replayUrl?: string | null;
      vidcastShareUrl?: string | null;
      replaySummarySource?: string;
      callHighlights?: unknown[];
      transcriptText?: string;
      gongSummaryText?: string;
    };

    const currentSummary = meta.gongSummaryText ?? email.summary ?? "";
    const hasVidcastSignals =
      Boolean(meta.replayUrl) ||
      Boolean(meta.vidcastShareUrl) ||
      Boolean(meta.transcriptText) ||
      meta.replaySummarySource === "vidcast" ||
      meta.replaySummarySource === "transcript";

    if (!hasVidcastSignals) continue;

    if (
      meta.replaySummarySource === "transcript" &&
      meta.transcriptText &&
      !isShallowReplaySummary(currentSummary)
    ) {
      continue;
    }
    if (!meta.replayUrl && !meta.vidcastShareUrl) continue;

    const replay = parseReplayEmail({
      messageId: email.externalId,
      subject: email.subject ?? "",
      body: email.body,
      fromAddress: email.authorEmail ?? "",
      receivedAt: email.receivedAt,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!replay?.replayUrl) continue;

    try {
      await upsertInternalCallReplay( replay, email.id);
      refreshed++;
    } catch {
      /* skip */
    }
  }

  return { refreshed };
}
