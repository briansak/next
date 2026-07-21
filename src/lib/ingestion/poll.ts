import { prisma } from "@/lib/db";
import { getAppConfig } from "@/lib/config/app-config-store";
import { resolveAppConfig } from "@/lib/config/app-config";
import { getFirstUserId } from "@/lib/user/profile";
import {
  importFromAppleCalendar,
  importFromAppleMail,
  runEmailBackfills,
} from "@/lib/integrations/email/ingest";
import { appleCalendarImportEnabled } from "@/lib/integrations/email/apple-calendar";
import { correlateGongEmails } from "@/lib/integrations/gong/correlate";
import { appleMailImportEnabled } from "@/lib/integrations/email/apple-mail";
import { syncWebexMessages } from "@/lib/integrations/webex/ingest";
import { syncWebexMeetings } from "@/lib/integrations/webex/meetings-ingest";
import type { MeetingSyncResult } from "@/lib/integrations/webex/meetings-ingest";

export interface PollResult {
  webex?: {
    messages?: { fetched: number; ingested: number; updated: number };
    meetings?: MeetingSyncResult;
    error?: string;
  };
  appleMail?: {
    imported: number;
    skipped: number;
    rejected: number;
    candidates: number;
    error?: string;
  };
  gong?: { scanned: number; correlated: number; unmatched: number };
  appleCalendar?: {
    imported: number;
    skipped: number;
    rejected: number;
    candidates: number;
    error?: string;
  };
  internalCalls?: {
    scanned: number;
    ingested: number;
    upgraded: number;
    skipped: number;
    personalReplayCandidates?: number;
    error?: string;
  };
}

export interface IngestionPollResult {
  polledAt: string;
  result: PollResult;
  durationMs: number;
}

export function ingestionPollEnabled(): boolean {
  return process.env.ENABLE_INGESTION_POLL === "true";
}

async function resolvePollAppConfig() {
  const userId = await getFirstUserId();
  if (userId) {
    return getAppConfig(userId);
  }
  return resolveAppConfig(null);
}

export async function shouldStartIngestionPoller(): Promise<boolean> {
  if (ingestionPollEnabled()) return true;

  const config = await resolvePollAppConfig();
  return config.enableIngestionPoll;
}

export function ingestionPollIntervalMs(): number {
  const configured = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "300000");
  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 300_000;
}

async function resolveGlobalPollIntervalMs(): Promise<number> {
  const config = await resolvePollAppConfig();
  if (config.enableIngestionPoll) {
    return Math.min(ingestionPollIntervalMs(), config.ingestionPollIntervalMs);
  }
  return ingestionPollIntervalMs();
}

async function hasActivePolicies(): Promise<boolean> {
  const count = await prisma.ingestionPolicy.count({
    where: { status: "ACTIVE" },
  });
  return count > 0;
}

async function hasWebexConnection(): Promise<boolean> {
  const token = await prisma.integrationToken.findUnique({
    where: { provider: "WEBEX" },
    select: { id: true },
  });
  return !!token;
}

async function hasActiveEmailPolicy(): Promise<boolean> {
  const policy = await prisma.ingestionPolicy.findUnique({
    where: { source: "EMAIL" },
    select: { status: true },
  });
  return policy?.status === "ACTIVE";
}

export async function pollIngestion(): Promise<PollResult> {
  const result: PollResult = {};
  const appConfig = await resolvePollAppConfig();

  if (!appConfig.enableIngestionPoll) {
    return result;
  }

  if (await hasWebexConnection()) {
    try {
      result.webex = {
        messages: await syncWebexMessages(),
        meetings: await syncWebexMeetings(),
      };
    } catch (err) {
      result.webex = {
        error: err instanceof Error ? err.message : "Webex sync failed",
      };
    }
  }

  if (await hasActiveEmailPolicy()) {
    if (appleMailImportEnabled()) {
      const mail = await importFromAppleMail();
      result.appleMail = {
        imported: mail.imported,
        skipped: mail.skipped,
        rejected: mail.rejected,
        candidates: mail.candidates,
        error: mail.errors[0],
      };
    }

    if (appleCalendarImportEnabled()) {
      const calendar = await importFromAppleCalendar();
      result.appleCalendar = {
        imported: calendar.imported,
        skipped: calendar.skipped,
        rejected: calendar.rejected,
        candidates: calendar.candidates,
        error: calendar.errors[0],
      };
    }

    if (appConfig.enableGongEmailCorrelation) {
      result.gong = await correlateGongEmails();
    }

    try {
      const backfill = await runEmailBackfills();
      result.internalCalls = {
        scanned: backfill.internalCallsBackfill.scanned,
        ingested: backfill.internalCallsBackfill.ingested,
        upgraded: backfill.internalCallsBackfill.upgraded,
        skipped: backfill.internalCallsBackfill.skipped,
      };
    } catch (err) {
      result.internalCalls = {
        scanned: 0,
        ingested: 0,
        upgraded: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : "Internal calls sync failed",
      };
    }
  }

  return result;
}

export async function runIngestionPoll(): Promise<IngestionPollResult> {
  const started = Date.now();

  if (!(await hasActivePolicies())) {
    return {
      polledAt: new Date().toISOString(),
      result: {},
      durationMs: Date.now() - started,
    };
  }

  let result: PollResult;
  try {
    result = await pollIngestion();
  } catch (err) {
    result = {
      webex: {
        error: err instanceof Error ? err.message : "Poll failed",
      },
    };
  }

  return {
    polledAt: new Date().toISOString(),
    result,
    durationMs: Date.now() - started,
  };
}

let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function logPollSummary(result: IngestionPollResult): void {
  const poll = result.result;
  const parts: string[] = [];
  const wx = poll.webex;
  if (wx?.messages) {
    parts.push(
      `webex messages +${wx.messages.ingested}/${wx.messages.fetched}`
    );
  }
  if (wx?.meetings) {
    parts.push(
      `webex meetings +${wx.meetings.ingested}/${wx.meetings.fetched}`
    );
  }
  if (poll.appleMail) {
    parts.push(
      `mail +${poll.appleMail.imported}/${poll.appleMail.candidates}`
    );
  }
  if (poll.appleCalendar) {
    parts.push(
      `calendar +${poll.appleCalendar.imported}/${poll.appleCalendar.candidates}`
    );
  }
  if (wx?.error) parts.push(`webex error: ${wx.error}`);
  if (poll.appleMail?.error) parts.push(`mail error: ${poll.appleMail.error}`);
  if (poll.gong) {
    parts.push(
      `gong correlated ${poll.gong.correlated}/${poll.gong.scanned}`
    );
  }
  if (poll.appleCalendar?.error) {
    parts.push(`calendar error: ${poll.appleCalendar.error}`);
  }
  if (parts.length > 0) {
    console.info(`[ingestion-poll] ${parts.join(" · ")}`);
  }
  console.info(`[ingestion-poll] completed in ${result.durationMs}ms`);
}

async function runPollTick(): Promise<void> {
  if (pollInFlight) {
    console.info("[ingestion-poll] skipped — previous poll still running");
    return;
  }

  pollInFlight = true;
  try {
    const result = await runIngestionPoll();
    logPollSummary(result);
  } catch (err) {
    console.error(
      "[ingestion-poll] failed:",
      err instanceof Error ? err.message : err
    );
  } finally {
    pollInFlight = false;
  }
}

/** Start background polling when enabled via env or user app config. */
export async function startIngestionPoller(): Promise<void> {
  if (!(await shouldStartIngestionPoller())) return;
  if (pollTimer) return;

  const intervalMs = await resolveGlobalPollIntervalMs();
  console.info(
    `[ingestion-poll] enabled — every ${Math.round(intervalMs / 1000)}s`
  );

  void runPollTick();
  pollTimer = setInterval(() => {
    void runPollTick();
  }, intervalMs);
}

export async function restartIngestionPoller(): Promise<void> {
  stopIngestionPoller();
  await startIngestionPoller();
}

export function stopIngestionPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
