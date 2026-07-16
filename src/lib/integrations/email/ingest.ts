import { prisma } from "@/lib/db";
import { analyzeCommunication, scoreToPriority } from "@/lib/heuristics";
import { analyzeCalendarEvent } from "@/lib/heuristics/calendar-planning";
import { tryCorrelateGongEmail } from "@/lib/integrations/gong/correlate";
import { tryIngestReplayEmail, backfillInternalCallReplays, type BackfillInternalCallsResult } from "@/lib/integrations/internal-calls/replay-ingest";
import {
  backfillProductAnnouncements,
  tryIngestProductAnnouncementEmail,
  type BackfillProductAnnouncementsResult,
} from "@/lib/integrations/email/product-announcement-ingest";
import { INTERNAL_CALL_LOOKBACK_DAYS } from "@/lib/integrations/gong/internal-calls";
import {
  scoreCalendarPartnerPriority,
  type EmailAllowlistRule,
  type EmailMessage,
} from "@/lib/integrations/email/allowlist";
import {
  extractOutlookArchive,
  parseIcsFiles,
  validateArchiveSize,
} from "@/lib/integrations/email/archive";
import {
  parsedEmlToEmailMessage,
  parseEml,
  validateEmlSize,
} from "@/lib/integrations/email/eml";
import {
  appleCalendarImportEnabled,
  fetchAppleCalendarEvents,
  rawEventToCalendarEvent,
} from "@/lib/integrations/email/apple-calendar";
import {
  appleMailImportEnabled,
  scanAppleMailMessages,
} from "@/lib/integrations/email/apple-mail";
import {
  calendarEventId,
  type CalendarEvent,
} from "@/lib/integrations/email/ics";
import {
  fetchMailboxEmails,
  fetchPersonalMailboxReplayEmails,
  getMicrosoft365Config,
  probeMicrosoft365Mailbox,
  refreshMicrosoft365Token,
} from "@/lib/integrations/microsoft365";
import { getTenantMembers } from "@/lib/tenant/members";
import { normalizeEmailBodyText } from "@/lib/integrations/email/body-text";
import {
  calendarEventKindFromInput,
  calendarKindTags,
  calendarRequiresTravelFlag,
  reconcileCalendarEventClusters,
} from "@/lib/integrations/email/calendar-clusters";

export const EMAIL_LOOKBACK_DAYS = 14;

export async function getMicrosoft365AccessToken(
  tenantId: string
): Promise<string | null> {
  const config = getMicrosoft365Config();
  if (!config) return null;

  const token = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "MICROSOFT365" },
    },
  });

  if (!token) return null;

  if (token.expiresAt && token.expiresAt > new Date()) {
    return token.accessToken;
  }

  if (!token.refreshToken) {
    return token.accessToken;
  }

  try {
    const refreshed = await refreshMicrosoft365Token(config, token.refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

    await prisma.integrationToken.update({
      where: { id: token.id },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt,
      },
    });

    return refreshed.accessToken;
  } catch (err) {
    console.error("Microsoft 365 token refresh failed:", err);
    return null;
  }
}

export async function getActiveEmailAllowlist(
  tenantId: string
): Promise<EmailAllowlistRule[]> {
  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      tenantId,
      source: "EMAIL",
      status: "ACTIVE",
    },
    include: { emailAllowlists: true },
  });

  if (!policy) return [];

  return policy.emailAllowlists.map((rule) => ({
    fromAddress: rule.fromAddress,
    fromDomain: rule.fromDomain,
    subjectPrefix: rule.subjectPrefix,
  }));
}

export async function isEmailIngestionActive(tenantId: string): Promise<boolean> {
  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      tenantId,
      source: "EMAIL",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return !!policy;
}

function plainBody(message: EmailMessage): string {
  return normalizeEmailBodyText(message.body ?? "");
}

export async function ingestEmailMessage(
  tenantId: string,
  message: EmailMessage,
  allowlistRef?: string,
  options?: { importSource?: "graph" | "eml" | "apple-mail" }
): Promise<{ created: boolean; id: string; gong?: boolean }> {
  const gongResult = await tryCorrelateGongEmail(tenantId, {
    messageId: message.messageId,
    subject: message.subject,
    body: message.body,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    receivedAt: message.receivedAt,
    threadId: message.threadId,
    toAddresses: message.toAddresses ?? [],
    ccAddresses: message.ccAddresses ?? [],
  });
  if (gongResult.handled) {
    return {
      created: Boolean(gongResult.correlated || gongResult.internalCall),
      id: gongResult.meetingId ?? message.messageId,
      gong: true,
    };
  }

  const replayResult = await tryIngestReplayEmail(tenantId, {
    messageId: message.messageId,
    subject: message.subject,
    body: message.body,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    receivedAt: message.receivedAt,
    threadId: message.threadId,
    toAddresses: message.toAddresses ?? [],
    ccAddresses: message.ccAddresses ?? [],
  });
  if (replayResult.handled) {
    return {
      created: replayResult.created,
      id: replayResult.id ?? message.messageId,
    };
  }

  const announcementResult = await tryIngestProductAnnouncementEmail(tenantId, {
    messageId: message.messageId,
    subject: message.subject,
    body: message.body,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    receivedAt: message.receivedAt,
    threadId: message.threadId,
    toAddresses: message.toAddresses ?? [],
    ccAddresses: message.ccAddresses ?? [],
  });
  if (announcementResult.handled) {
    return {
      created: announcementResult.created,
      id: announcementResult.id ?? message.messageId,
    };
  }

  const body = plainBody(message);
  const teamMembers = await getTenantMembers(tenantId);
  const partnerAllowlistRules = await getActiveEmailAllowlist(tenantId);

  const analysis = analyzeCommunication({
    body,
    subject: message.subject,
    authorName: message.fromName,
    receivedAt: message.receivedAt,
    teamMembers,
    fromAddress: message.fromAddress,
    toAddresses: message.toAddresses,
    ccAddresses: message.ccAddresses,
    listId: message.listId,
    precedence: message.precedence,
    listUnsubscribe: message.listUnsubscribe,
    autoSubmitted: message.autoSubmitted,
    partnerAllowlistRules,
  });

  const existing = await prisma.communication.findUnique({
    where: {
      tenantId_source_externalId: {
        tenantId,
        source: "EMAIL",
        externalId: message.messageId,
      },
    },
  });

  const data = {
    subject: message.subject,
    body,
    excerpt: analysis.summary,
    authorName: message.fromName,
    authorEmail: message.fromAddress,
    receivedAt: message.receivedAt,
    priority: analysis.priority,
    priorityScore: analysis.priorityScore,
    priorityReasons: analysis.priorityReasons,
    summary: analysis.summary,
    tags: [
      ...analysis.tags,
      "email",
      ...(options?.importSource === "eml" ? ["eml-import"] : []),
      ...(options?.importSource === "apple-mail" ? ["apple-mail-import"] : []),
    ],
    allowlistRef,
    metadata: {
      threadId: message.threadId,
      fromAddress: message.fromAddress,
      mentionedUserIds: analysis.mentionedUserIds,
      directedRecipientUserIds: analysis.directedRecipientUserIds,
      toAddresses: message.toAddresses,
      ccAddresses: message.ccAddresses,
      hasQuestion: analysis.hasQuestion,
      isMailer: analysis.isMailer,
      questionSnippets: analysis.questionSnippets,
      importSource: options?.importSource ?? "graph",
    },
  };

  if (existing) {
    await prisma.communication.update({
      where: { id: existing.id },
      data,
    });
    return { created: false, id: existing.id };
  }

  const communication = await prisma.communication.create({
    data: {
      tenantId,
      source: "EMAIL",
      externalId: message.messageId,
      threadId: message.threadId,
      ...data,
    },
  });

  if (analysis.suggestedAction) {
    const mentionedAssignees = analysis.mentionedUserIds;
    const directedAssignees = analysis.directedRecipientUserIds.filter(
      (userId) => !mentionedAssignees.includes(userId)
    );

    if (mentionedAssignees.length > 0) {
      for (const userId of mentionedAssignees) {
        await prisma.nextStep.create({
          data: {
            tenantId,
            communicationId: communication.id,
            title: "Respond — you were @mentioned",
            priority: analysis.priority,
            status: "OPEN",
            assigneeId: userId,
          },
        });
      }
    }

    if (directedAssignees.length > 0) {
      for (const userId of directedAssignees) {
        await prisma.nextStep.create({
          data: {
            tenantId,
            communicationId: communication.id,
            title: "Answer the question in this email",
            priority: analysis.priority,
            status: "OPEN",
            assigneeId: userId,
          },
        });
      }
    }

    if (mentionedAssignees.length === 0 && directedAssignees.length === 0) {
      await prisma.nextStep.create({
        data: {
          tenantId,
          communicationId: communication.id,
          title: analysis.suggestedAction,
          priority: analysis.priority,
          status: "OPEN",
        },
      });
    }
  }

  return { created: true, id: communication.id };
}

export interface EmailSyncResult {
  fetched: number;
  ingested: number;
  skipped: number;
  mailbox?: string;
  connectedAs?: string;
  error?: string;
  personalReplayCandidates?: number;
  internalCallsBackfill?: {
    scanned: number;
    ingested: number;
    upgraded: number;
    skipped: number;
  };
  productAnnouncementsBackfill?: {
    scanned: number;
    upgraded: number;
    created: number;
  };
}

export async function syncEmailMessages(
  tenantId: string
): Promise<EmailSyncResult> {
  const sharedMailbox = process.env.MICROSOFT_SHARED_MAILBOX?.trim();
  if (!sharedMailbox) {
    return {
      fetched: 0,
      ingested: 0,
      skipped: 0,
      error: "MICROSOFT_SHARED_MAILBOX is not configured in .env",
    };
  }

  const accessToken = await getMicrosoft365AccessToken(tenantId);
  if (!accessToken) {
    return {
      fetched: 0,
      ingested: 0,
      skipped: 0,
      error:
        "Microsoft 365 is not connected or the refresh token expired. Reconnect on ingestion settings (you may need to complete Duo again).",
    };
  }

  const tokenRecord = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "MICROSOFT365" },
    },
  });
  const connectedAs =
    (tokenRecord?.metadata as { connectedAs?: string } | null)?.connectedAs;

  if (!(await isEmailIngestionActive(tenantId))) {
    return {
      fetched: 0,
      ingested: 0,
      skipped: 0,
      mailbox: sharedMailbox,
      connectedAs,
      error:
        "Email ingestion policy is not active. Activate the email policy after connecting.",
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - EMAIL_LOOKBACK_DAYS);

  const internalSince = new Date();
  internalSince.setDate(internalSince.getDate() - INTERNAL_CALL_LOOKBACK_DAYS);

  let messages: EmailMessage[];
  let personalReplayMessages: EmailMessage[] = [];
  try {
    messages = await fetchMailboxEmails(accessToken, sharedMailbox, since);
    personalReplayMessages = await fetchPersonalMailboxReplayEmails(
      accessToken,
      internalSince
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Graph API failed";
    return {
      fetched: 0,
      ingested: 0,
      skipped: 0,
      mailbox: sharedMailbox,
      connectedAs,
      error: message,
    };
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });

  let ingested = 0;
  let skipped = 0;

  const seenIds = new Set<string>();
  const allMessages = [...messages, ...personalReplayMessages].filter((message) => {
    if (seenIds.has(message.messageId)) return false;
    seenIds.add(message.messageId);
    return true;
  });

  for (const message of allMessages) {
    try {
      const result = await ingestEmailMessage(
        tenantId,
        message,
        policy?.id
      );
      if (result.created) ingested++;
      else skipped++;
    } catch (err) {
      console.error(`Failed to ingest email ${message.messageId}:`, err);
      skipped++;
    }
  }

  const backfill = await backfillInternalCallReplays(tenantId);
  const productAnnouncementsBackfill = await backfillProductAnnouncements(tenantId);

  return {
    fetched: allMessages.length,
    ingested,
    skipped,
    mailbox: sharedMailbox,
    connectedAs,
    personalReplayCandidates: personalReplayMessages.length,
    internalCallsBackfill: backfill,
    productAnnouncementsBackfill,
  };
}

export async function testMicrosoft365Connection(
  tenantId: string
): Promise<{
  ok: boolean;
  mailbox: string;
  connectedAs?: string;
  sampleCount?: number;
  error?: string;
  hint?: string;
}> {
  const sharedMailbox = process.env.MICROSOFT_SHARED_MAILBOX?.trim();
  if (!sharedMailbox) {
    return {
      ok: false,
      mailbox: "(not configured)",
      error: "MICROSOFT_SHARED_MAILBOX is not set",
    };
  }

  const accessToken = await getMicrosoft365AccessToken(tenantId);
  if (!accessToken) {
    return {
      ok: false,
      mailbox: sharedMailbox,
      error: "Not connected or token refresh failed",
      hint: "Reconnect Microsoft 365 and complete Duo when prompted.",
    };
  }

  const tokenRecord = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "MICROSOFT365" },
    },
  });
  const connectedAs =
    (tokenRecord?.metadata as { connectedAs?: string } | null)?.connectedAs;

  const probe = await probeMicrosoft365Mailbox(accessToken, sharedMailbox);
  if (!probe.ok) {
    return {
      ok: false,
      mailbox: sharedMailbox,
      connectedAs,
      error: probe.error,
      hint: probe.hint,
    };
  }

  return {
    ok: true,
    mailbox: sharedMailbox,
    connectedAs,
    sampleCount: probe.messageCount,
  };
}

export interface EmlImportResult {
  imported: number;
  skipped: number;
  rejected: number;
  errors: string[];
  internalCallsBackfill?: BackfillInternalCallsResult;
  productAnnouncementsBackfill?: BackfillProductAnnouncementsResult;
}

/** Import .eml files saved from Outlook — no Azure app registration required. */
export async function importEmlFiles(
  tenantId: string,
  files: Array<{ name: string; content: string }>
): Promise<EmlImportResult> {
  if (!(await isEmailIngestionActive(tenantId))) {
    return {
      imported: 0,
      skipped: 0,
      rejected: files.length,
      errors: [
        "Email ingestion policy is not active. Activate the email policy first.",
      ],
    };
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });

  let imported = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (!validateEmlSize(bytes)) {
      rejected++;
      errors.push(`${file.name}: empty or larger than 5 MB`);
      continue;
    }

    const parsed = parseEml(file.content);
    if (!parsed) {
      rejected++;
      errors.push(`${file.name}: could not parse as email`);
      continue;
    }

    const message = parsedEmlToEmailMessage(parsed);

    const gongResult = await tryCorrelateGongEmail(tenantId, parsed);
    if (gongResult.handled) {
      if (gongResult.correlated) imported++;
      else rejected++;
      continue;
    }

    const replayResult = await tryIngestReplayEmail(tenantId, message);
    if (replayResult.handled) {
      if (replayResult.created || replayResult.upgraded) imported++;
      else skipped++;
      continue;
    }

    try {
      const result = await ingestEmailMessage(
        tenantId,
        message,
        policy?.id,
        { importSource: "eml" }
      );
      if (result.created) imported++;
      else skipped++;
    } catch (err) {
      rejected++;
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : "import failed"}`
      );
    }
  }

  const backfill = await backfillInternalCallReplays(tenantId);
  const productAnnouncementsBackfill = await backfillProductAnnouncements(tenantId);

  return { imported, skipped, rejected, errors, internalCallsBackfill: backfill, productAnnouncementsBackfill };
}

function buildCalendarBody(event: CalendarEvent): string {
  const parts = [
    `Event: ${event.summary}`,
    `Starts: ${event.start.toLocaleString()}`,
  ];
  if (event.end) parts.push(`Ends: ${event.end.toLocaleString()}`);
  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.organizerName || event.organizerEmail) {
    parts.push(
      `Organizer: ${event.organizerName ?? event.organizerEmail}${
        event.organizerEmail ? ` (${event.organizerEmail})` : ""
      }`
    );
  }
  if (event.attendeeEmails.length > 0) {
    parts.push(`Attendees: ${event.attendeeEmails.join(", ")}`);
  }
  if (event.description) parts.push(`\n${event.description}`);
  return parts.join("\n");
}

export async function ingestCalendarEvent(
  tenantId: string,
  event: CalendarEvent,
  allowlistRef?: string,
  sourceFile?: string,
  options?: { importSource?: "archive" | "apple-calendar" }
): Promise<{ created: boolean; id: string }> {
  const body = buildCalendarBody(event);
  const allowlist = await getActiveEmailAllowlist(tenantId);
  const partnerDomains = [
    ...new Set(
      allowlist
        .map((rule) => rule.fromDomain?.toLowerCase())
        .filter((domain): domain is string => !!domain)
    ),
  ];

  const analysis = analyzeCalendarEvent({
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    attendeeEmails: event.attendeeEmails,
    organizerEmail: event.organizerEmail,
    organizerName: event.organizerName,
    isRecurring: event.isRecurring,
    isAllDay: event.isAllDay,
    partnerDomains,
  });

  const isCalendarNoise =
    analysis.tags.includes("calendar-hold") || analysis.tags.includes("routine");

  const partnerMatch = scoreCalendarPartnerPriority(
    { summary: event.summary, organizerEmail: event.organizerEmail },
    allowlist
  );
  if (partnerMatch.matched && !isCalendarNoise) {
    analysis.priorityScore = Math.min(
      10,
      analysis.priorityScore + partnerMatch.scoreBoost
    );
    analysis.priority = scoreToPriority(analysis.priorityScore);
    analysis.priorityReasons.push(...partnerMatch.reasons);
    analysis.tags.push(...partnerMatch.tags);
  }

  if (isCalendarNoise) {
    analysis.priorityScore = 0;
    analysis.priority = "INFO";
    analysis.needsPlanning = false;
    analysis.suggestedAction = undefined;
  }

  const eventKind = calendarEventKindFromInput(event);
  const kindTags = isCalendarNoise ? [] : calendarKindTags(eventKind);
  analysis.tags.push(...kindTags);

  if (!isCalendarNoise && eventKind === "conference") {
    analysis.priorityScore = Math.min(10, analysis.priorityScore + 2);
    analysis.priority = scoreToPriority(analysis.priorityScore);
    analysis.priorityReasons.push("Conference or major industry event");
    if (analysis.needsPlanning) {
      analysis.tags.push("needs-prep");
    }
  } else if (
    !isCalendarNoise &&
    (eventKind === "travel-flight" ||
      eventKind === "travel-hotel" ||
      eventKind === "travel-other")
  ) {
    analysis.needsPlanning = false;
    analysis.priorityScore = 1;
    analysis.priority = "INFO";
    analysis.suggestedAction = undefined;
    analysis.priorityReasons.push("Travel logistics linked to a larger trip");
  }

  const externalId = calendarEventId(event.uid, event.start);

  const existing = await prisma.communication.findUnique({
    where: {
      tenantId_source_externalId: {
        tenantId,
        source: "OUTLOOK_CALENDAR",
        externalId,
      },
    },
  });

  const data = {
    subject: event.summary,
    body,
    excerpt: analysis.summary,
    authorName: event.organizerName,
    authorEmail: event.organizerEmail,
    receivedAt: event.start,
    priority: analysis.priority,
    priorityScore: analysis.priorityScore,
    priorityReasons: analysis.priorityReasons,
    summary: analysis.summary,
    tags: [
      ...analysis.tags,
      "calendar",
      options?.importSource === "apple-calendar"
        ? "apple-calendar-import"
        : "outlook-import",
    ],
    allowlistRef,
    metadata: {
      uid: event.uid,
      endTime: event.end?.toISOString(),
      location: event.location,
      attendeeEmails: event.attendeeEmails,
      importSource: options?.importSource ?? "archive",
      sourceFile,
      isRecurring: event.isRecurring ?? false,
      isAllDay: event.isAllDay ?? false,
      needsPlanning: analysis.needsPlanning,
      daysUntil: analysis.daysUntil,
      durationMinutes: analysis.durationMinutes,
      externalAttendees: analysis.externalAttendees,
      eventKind,
      requiresTravel: calendarRequiresTravelFlag(event),
    },
  };

  if (existing) {
    await prisma.communication.update({ where: { id: existing.id }, data });
    return { created: false, id: existing.id };
  }

  const communication = await prisma.communication.create({
    data: {
      tenantId,
      source: "OUTLOOK_CALENDAR",
      externalId,
      threadId: event.uid,
      ...data,
    },
  });

  if (analysis.suggestedAction && analysis.needsPlanning) {
    const prepDue = new Date(event.start);
    prepDue.setDate(prepDue.getDate() - 2);

    await prisma.nextStep.create({
      data: {
        tenantId,
        communicationId: communication.id,
        title: analysis.suggestedAction,
        priority: analysis.priority,
        status: "OPEN",
        dueAt: prepDue,
      },
    });
  }

  return { created: true, id: communication.id };
}

export interface OutlookArchiveImportResult {
  emails: { imported: number; skipped: number; rejected: number };
  calendar: { imported: number; skipped: number; rejected: number };
  warnings: string[];
  errors: string[];
}

/** Import Outlook .zip / .pst / .ics archives (email + calendar). */
export async function importOutlookArchive(
  tenantId: string,
  filename: string,
  data: Buffer
): Promise<OutlookArchiveImportResult> {
  if (!(await isEmailIngestionActive(tenantId))) {
    return {
      emails: { imported: 0, skipped: 0, rejected: 0 },
      calendar: { imported: 0, skipped: 0, rejected: 0 },
      warnings: [],
      errors: [
        "Email ingestion policy is not active. Activate the email policy first.",
      ],
    };
  }

  if (!validateArchiveSize(data.byteLength)) {
    return {
      emails: { imported: 0, skipped: 0, rejected: 0 },
      calendar: { imported: 0, skipped: 0, rejected: 0 },
      warnings: [],
      errors: ["Archive is empty or larger than 200 MB"],
    };
  }

  let extracted;
  try {
    extracted = await extractOutlookArchive(filename, data);
  } catch (err) {
    return {
      emails: { imported: 0, skipped: 0, rejected: 0 },
      calendar: { imported: 0, skipped: 0, rejected: 0 },
      warnings: [],
      errors: [err instanceof Error ? err.message : "Archive extraction failed"],
    };
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });

  const emailResult = await importEmlFiles(tenantId, extracted.emlFiles);
  const calendarResult = { imported: 0, skipped: 0, rejected: 0 };
  const errors = [...emailResult.errors];

  for (const icsFile of parseIcsFiles(extracted.icsFiles)) {
    for (const event of icsFile.events) {
      try {
        const result = await ingestCalendarEvent(
          tenantId,
          event,
          policy?.id,
          icsFile.name
        );
        if (result.created) calendarResult.imported++;
        else calendarResult.skipped++;
      } catch (err) {
        calendarResult.rejected++;
        errors.push(
          `${icsFile.name}: ${err instanceof Error ? err.message : "calendar import failed"}`
        );
      }
    }
  }

  if (calendarResult.imported > 0 || calendarResult.skipped > 0) {
    await reconcileCalendarEventClusters(tenantId).catch(() => undefined);
  }

  return {
    emails: {
      imported: emailResult.imported,
      skipped: emailResult.skipped,
      rejected: emailResult.rejected,
    },
    calendar: calendarResult,
    warnings: extracted.warnings,
    errors,
  };
}

export interface AppleMailImportResult {
  scanned: number;
  candidates: number;
  imported: number;
  skipped: number;
  rejected: number;
  root: string;
  warnings: string[];
  errors: string[];
  internalCallsBackfill?: BackfillInternalCallsResult;
  productAnnouncementsBackfill?: BackfillProductAnnouncementsResult;
}

/** Read local Apple Mail cache (~/Library/Mail) and import allowlisted messages. */
export async function importFromAppleMail(
  tenantId: string
): Promise<AppleMailImportResult> {
  if (!appleMailImportEnabled()) {
    return {
      scanned: 0,
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      root: "",
      warnings: [],
      errors: [
        "Apple Mail import is disabled. Set ENABLE_APPLE_MAIL_IMPORT=true in .env and restart the dev server.",
      ],
    };
  }

  if (!(await isEmailIngestionActive(tenantId))) {
    return {
      scanned: 0,
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      root: "",
      warnings: [],
      errors: [
        "Email ingestion policy is not active. Activate the email policy first.",
      ],
    };
  }

  let scan;
  try {
    scan = await scanAppleMailMessages({
      lookbackDays: Math.max(EMAIL_LOOKBACK_DAYS, INTERNAL_CALL_LOOKBACK_DAYS),
    });
  } catch (err) {
    return {
      scanned: 0,
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      root: "",
      warnings: [],
      errors: [err instanceof Error ? err.message : "Apple Mail scan failed"],
    };
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });

  let imported = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const file of scan.messages) {
    const parsed = parseEml(file.content);
    if (!parsed) {
      rejected++;
      errors.push(`${file.name}: could not parse`);
      continue;
    }

    const message = parsedEmlToEmailMessage(parsed);

    const gongResult = await tryCorrelateGongEmail(tenantId, parsed);
    if (gongResult.handled) {
      if (gongResult.correlated) imported++;
      else rejected++;
      continue;
    }

    const replayResult = await tryIngestReplayEmail(tenantId, message);
    if (replayResult.handled) {
      if (replayResult.created || replayResult.upgraded) imported++;
      else skipped++;
      continue;
    }

    try {
      const result = await ingestEmailMessage(
        tenantId,
        message,
        policy?.id,
        { importSource: "apple-mail" }
      );
      if (result.created) imported++;
      else skipped++;
    } catch (err) {
      rejected++;
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : "import failed"}`
      );
    }
  }

  const backfill = await backfillInternalCallReplays(tenantId);
  const productAnnouncementsBackfill = await backfillProductAnnouncements(tenantId);

  return {
    scanned: scan.filesScanned,
    candidates: scan.messages.length,
    imported,
    skipped,
    rejected,
    root: scan.root,
    warnings: scan.warnings,
    errors: errors.slice(0, 20),
    internalCallsBackfill: backfill,
    productAnnouncementsBackfill,
  };
}

export interface AppleCalendarImportResult {
  calendars: string[];
  candidates: number;
  imported: number;
  skipped: number;
  rejected: number;
  warnings: string[];
  errors: string[];
}

/** Read events from Apple Calendar.app via EventKit and import allowlisted items. */
export async function importFromAppleCalendar(
  tenantId: string
): Promise<AppleCalendarImportResult> {
  if (!appleCalendarImportEnabled()) {
    return {
      calendars: [],
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      warnings: [],
      errors: [
        "Apple Calendar import is disabled. Set ENABLE_APPLE_CALENDAR_IMPORT=true in .env and restart the dev server.",
      ],
    };
  }

  if (!(await isEmailIngestionActive(tenantId))) {
    return {
      calendars: [],
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      warnings: [],
      errors: [
        "Email ingestion policy is not active. Activate the email policy first.",
      ],
    };
  }

  let scan;
  try {
    scan = await fetchAppleCalendarEvents();
  } catch (err) {
    return {
      calendars: [],
      candidates: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
      warnings: [],
      errors: [err instanceof Error ? err.message : "Apple Calendar export failed"],
    };
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });

  let imported = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const raw of scan.events) {
    const event = rawEventToCalendarEvent(raw);

    try {
      const result = await ingestCalendarEvent(
        tenantId,
        event,
        policy?.id,
        raw.calendar,
        { importSource: "apple-calendar" }
      );
      if (result.created) imported++;
      else skipped++;
    } catch (err) {
      rejected++;
      errors.push(
        `${raw.summary}: ${err instanceof Error ? err.message : "import failed"}`
      );
    }
  }

  if (imported > 0 || skipped > 0) {
    await reconcileCalendarEventClusters(tenantId).catch(() => undefined);
  }

  return {
    calendars: scan.calendars,
    candidates: scan.events.length,
    imported,
    skipped,
    rejected,
    warnings: scan.warnings,
    errors: errors.slice(0, 20),
  };
}
