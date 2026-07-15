import { prisma } from "@/lib/db";
import type { Priority } from "@prisma/client";
import { analyzeCommunication } from "@/lib/heuristics";
import {
  analyzeMeetingTranscript,
  mergeMeetingActionItems,
} from "@/lib/heuristics/meeting-transcript";
import { getTenantMembers } from "@/lib/tenant/members";
import { getWebexAccessToken } from "./ingest";
import { resolveMeetingIntelligence } from "./meeting-intelligence";
import {
  buildMeetingBody,
  buildMeetingExcerpt,
  collectEmails,
  daysAgoIso,
  enrichMeeting,
  getWebexConnectorEmails,
  listRecentMeetings,
  MEETING_LOOKBACK_DAYS,
  meetingRelevantToEmails,
  type MeetingWithContext,
} from "./meetings";

export interface MeetingSyncResult {
  fetched: number;
  ingested: number;
  updated: number;
  ignored: number;
  errors: number;
  error?: string;
  connectorEmails?: string[];
}

async function gatherMeetingsForTenant(
  accessToken: string,
  memberEmails: string[]
): Promise<MeetingWithContext[]> {
  const from = daysAgoIso(MEETING_LOOKBACK_DAYS);
  const to = new Date().toISOString();
  const byId = new Map<string, MeetingWithContext>();

  const connectorEmails = await getWebexConnectorEmails(accessToken);
  const defaultMeetings = await listRecentMeetings(accessToken, { from, to });

  for (const meeting of defaultMeetings) {
    byId.set(meeting.id, {
      meeting,
      attributedToEmails: connectorEmails.filter((e) =>
        memberEmails.some((m) => m.toLowerCase() === e)
      ),
    });
  }

  for (const email of memberEmails) {
    try {
      const hosted = await listRecentMeetings(accessToken, {
        from,
        to,
        hostEmail: email,
      });
      for (const meeting of hosted) {
        const normalized = email.toLowerCase();
        const existing = byId.get(meeting.id);
        if (existing) {
          if (!existing.attributedToEmails.includes(normalized)) {
            existing.attributedToEmails.push(normalized);
          }
        } else {
          byId.set(meeting.id, {
            meeting,
            attributedToEmails: [normalized],
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("403") || message.includes("401")) continue;
      throw err;
    }
  }

  return [...byId.values()];
}

async function syncMeetingNextSteps(
  tenantId: string,
  communicationId: string,
  items: Array<{ title: string; assigneeUserIds: string[] }>,
  priority: Priority
): Promise<void> {
  const existing = await prisma.nextStep.findMany({
    where: {
      communicationId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((s) => s.title.toLowerCase()));

  for (const item of items) {
    const title = item.title.trim();
    if (!title || existingTitles.has(title.toLowerCase())) continue;

    await prisma.nextStep.create({
      data: {
        tenantId,
        communicationId,
        title,
        priority,
        status: "OPEN",
        assigneeId: item.assigneeUserIds[0] ?? null,
      },
    });
    existingTitles.add(title.toLowerCase());
  }
}

export async function ingestWebexMeeting(
  tenantId: string,
  entry: MeetingWithContext,
  accessToken: string,
  memberEmails: string[]
): Promise<{ created: boolean; id: string; skipped?: boolean }> {
  const { meeting, attributedToEmails } = entry;
  const enrichment = await enrichMeeting(accessToken, meeting);
  const intelligence = await resolveMeetingIntelligence(
    accessToken,
    meeting,
    enrichment
  );

  const enrichmentWithSummary = {
    ...enrichment,
    summary: intelligence.summaryText
      ? {
          id: "derived",
          meetingId: meeting.id,
          note: intelligence.summaryText,
          actionItems: intelligence.summaryActionItems,
        }
      : enrichment.summary,
  };

  const meetingEmails = collectEmails(meeting, enrichment);
  const relevantMembers = [
    ...new Set([
      ...meetingRelevantToEmails(meetingEmails, memberEmails),
      ...attributedToEmails.filter((e) =>
        memberEmails.some((m) => m.toLowerCase() === e)
      ),
    ]),
  ];

  if (relevantMembers.length === 0) {
    return { created: false, id: meeting.id, skipped: true };
  }

  let body = buildMeetingBody(meeting, enrichmentWithSummary);
  if (intelligence.transcriptText) {
    const excerpt = intelligence.transcriptText.slice(0, 1500);
    body += `\n\nTranscript excerpt:\n${excerpt}${intelligence.transcriptText.length > 1500 ? "…" : ""}`;
  }
  const receivedAt = new Date(meeting.end ?? meeting.start);
  const teamMembers = await getTenantMembers(tenantId);

  const transcriptAnalysis = analyzeMeetingTranscript(
    intelligence.transcriptText,
    teamMembers
  );
  const mergedActionItems = mergeMeetingActionItems(
    intelligence.summaryActionItems,
    transcriptAnalysis.actionItems
  );

  const analysisBody = intelligence.transcriptText
    ? `${body}\n\n${intelligence.transcriptText.slice(0, 8000)}`
    : body;

  const analysis = analyzeCommunication({
    body: analysisBody,
    subject: meeting.title,
    authorName: meeting.hostDisplayName,
    receivedAt,
    teamMembers,
  });

  let priorityScore = analysis.priorityScore;
  const tags = [...new Set([...analysis.tags, ...transcriptAnalysis.tags, "meeting"])];
  const reasons = [...analysis.priorityReasons, ...transcriptAnalysis.priorityReasons];

  priorityScore = Math.min(10, priorityScore + transcriptAnalysis.priorityBoost);

  if (intelligence.summaryText) {
    priorityScore = Math.min(10, priorityScore + 2);
    tags.push("ai-summary");
    reasons.push(
      intelligence.summarySource === "webex-ai"
        ? "Webex AI summary available"
        : "AI summary generated from transcript"
    );
  }

  if (mergedActionItems.length > 0) {
    priorityScore = Math.min(10, priorityScore + 1);
    if (!tags.includes("action-required")) tags.push("action-required");
    reasons.push("Meeting has action items");
  }

  const mentionedUserIds = [
    ...new Set([
      ...analysis.mentionedUserIds,
      ...transcriptAnalysis.mentionedUserIds,
      ...mergedActionItems.flatMap((item) => item.assigneeUserIds),
    ]),
  ];

  if (intelligence.transcriptText) {
    tags.push("transcript");
    reasons.push(
      intelligence.transcriptSource === "webex"
        ? "Meeting transcript available"
        : "Transcript generated from recording"
    );
  }

  const metadata = {
    meetingId: meeting.id,
    hostEmail: meeting.hostEmail,
    hostDisplayName: meeting.hostDisplayName,
    inviteeEmails: enrichment.invitees.map((i) => i.email).filter(Boolean),
    invitees: enrichment.invitees.map((i) => ({
      email: i.email,
      displayName: i.displayName,
      response: i.response,
    })),
    participantEmails: enrichment.participants
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e)),
    participants: enrichment.participants.map((p) => ({
      email: p.email,
      displayName: p.displayName,
    })),
    relevantUserEmails: relevantMembers,
    connectedAccountEmails: attributedToEmails,
    meetingType: meeting.meetingType,
    state: meeting.state,
    hasRecording:
      meeting.hasRecording ??
      (Boolean(intelligence.recordingDownloadUrl) ||
        enrichment.recordings.length > 0),
    hasSummary: meeting.hasSummary ?? Boolean(intelligence.summaryText),
    hasTranscription:
      meeting.hasTranscription ?? Boolean(intelligence.transcriptText),
    webLink: meeting.webLink,
    summaryText: intelligence.summaryText,
    summarySource: intelligence.summarySource,
    summaryActionItems: mergedActionItems.map((item) => item.title),
    actionItems: mergedActionItems.map((item) => ({
      title: item.title,
      assigneeUserIds: item.assigneeUserIds,
      source: item.source,
    })),
    transcriptActionItems: transcriptAnalysis.actionItems.map((item) => ({
      title: item.title,
      excerpt: item.excerpt.slice(0, 300),
      assigneeUserIds: item.assigneeUserIds,
      assigneeAliases: item.assigneeAliases,
    })),
    mentionedUserIds,
    transcriptText: intelligence.transcriptText
      ? intelligence.transcriptText.slice(0, 4000)
      : undefined,
    transcriptSource: intelligence.transcriptSource,
    recordingDownloadUrl: intelligence.recordingDownloadUrl,
    transcriptDownloadUrl: intelligence.transcriptDownloadUrl,
  };

  const existing = await prisma.communication.findUnique({
    where: {
      tenantId_source_externalId: {
        tenantId,
        source: "WEBEX_MEETING",
        externalId: meeting.id,
      },
    },
  });

  const data = {
    subject: meeting.title,
    body,
    excerpt:
      intelligence.summaryText?.slice(0, 220) ??
      intelligence.transcriptText?.slice(0, 220) ??
      buildMeetingExcerpt(meeting, enrichmentWithSummary),
    authorName: meeting.hostDisplayName,
    authorEmail: meeting.hostEmail,
    receivedAt,
    priority: analysis.priority,
    priorityScore,
    priorityReasons: reasons,
    summary: intelligence.summaryText ?? analysis.summary,
    tags,
    metadata,
  };

  if (existing) {
    await prisma.communication.update({
      where: { id: existing.id },
      data,
    });
    await syncMeetingNextSteps(
      tenantId,
      existing.id,
      mergedActionItems,
      analysis.priority
    );
    return { created: false, id: existing.id };
  }

  const communication = await prisma.communication.create({
    data: {
      tenantId,
      source: "WEBEX_MEETING",
      externalId: meeting.id,
      threadId: meeting.id,
      ...data,
    },
  });

  await syncMeetingNextSteps(
    tenantId,
    communication.id,
    mergedActionItems,
    analysis.priority
  );

  return { created: true, id: communication.id };
}

export async function syncWebexMeetings(
  tenantId: string
): Promise<MeetingSyncResult> {
  const accessToken = await getWebexAccessToken(tenantId);
  if (!accessToken) {
    throw new Error("Webex not connected");
  }

  const members = await getTenantMembers(tenantId);
  const memberEmails = members.map((m) => m.email);
  const connectorEmails = await getWebexConnectorEmails(accessToken);

  let meetings: MeetingWithContext[];
  try {
    meetings = await gatherMeetingsForTenant(accessToken, memberEmails);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting sync failed";
    if (message.includes("403") || message.includes("401")) {
      return {
        fetched: 0,
        ingested: 0,
        updated: 0,
        ignored: 0,
        errors: 0,
        connectorEmails,
        error:
          "Webex token is missing meeting scopes. Click Connect Webex again on ingestion settings to re-authorize with meeting permissions.",
      };
    }
    throw err;
  }

  let ingested = 0;
  let updated = 0;
  let ignored = 0;
  let errors = 0;

  for (const entry of meetings) {
    try {
      const result = await ingestWebexMeeting(
        tenantId,
        entry,
        accessToken,
        memberEmails
      );
      if (result.skipped) ignored++;
      else if (result.created) ingested++;
      else updated++;
    } catch (err) {
      console.error(`Failed to ingest meeting ${entry.meeting.id}:`, err);
      errors++;
    }
  }

  return {
    fetched: meetings.length,
    ingested,
    updated,
    ignored,
    errors,
    connectorEmails,
  };
}
