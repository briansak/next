import { prisma } from "@/lib/db";
import {
  importFromAppleCalendar,
  importFromAppleMail,
  syncEmailMessages,
} from "@/lib/integrations/email/ingest";
import { backfillInternalCallReplays } from "@/lib/integrations/internal-calls/replay-ingest";
import { appleCalendarImportEnabled } from "@/lib/integrations/email/apple-calendar";
import { correlateGongEmailsForTenant, gongEmailCorrelationEnabled } from "@/lib/integrations/gong/correlate";
import { appleMailImportEnabled } from "@/lib/integrations/email/apple-mail";
import {
  syncWebexMessages,
} from "@/lib/integrations/webex/ingest";
import { syncWebexMeetings } from "@/lib/integrations/webex/meetings-ingest";
import type { MeetingSyncResult } from "@/lib/integrations/webex/meetings-ingest";

export interface TenantPollResult {
  tenantId: string;
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
  tenants: TenantPollResult[];
  durationMs: number;
}

export function ingestionPollEnabled(): boolean {
  return process.env.ENABLE_INGESTION_POLL === "true";
}

export function ingestionPollIntervalMs(): number {
  const configured = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? "300000");
  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 300_000;
}

async function tenantIdsWithActivePolicies(): Promise<string[]> {
  const policies = await prisma.ingestionPolicy.findMany({
    where: { status: "ACTIVE" },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });
  return policies.map((p) => p.tenantId);
}

async function hasWebexConnection(tenantId: string): Promise<boolean> {
  const token = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "WEBEX" },
    },
    select: { id: true },
  });
  return !!token;
}

async function hasActiveEmailPolicy(tenantId: string): Promise<boolean> {
  const policy = await prisma.ingestionPolicy.findFirst({
    where: { tenantId, source: "EMAIL", status: "ACTIVE" },
    select: { id: true },
  });
  return !!policy;
}

async function hasMicrosoft365Connection(tenantId: string): Promise<boolean> {
  const token = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "MICROSOFT365" },
    },
    select: { id: true },
  });
  return !!token;
}

export async function pollTenantIngestion(
  tenantId: string
): Promise<TenantPollResult> {
  const result: TenantPollResult = { tenantId };

  if (await hasWebexConnection(tenantId)) {
    try {
      result.webex = {
        messages: await syncWebexMessages(tenantId),
        meetings: await syncWebexMeetings(tenantId),
      };
    } catch (err) {
      result.webex = {
        error: err instanceof Error ? err.message : "Webex sync failed",
      };
    }
  }

  if (await hasActiveEmailPolicy(tenantId)) {
    if (appleMailImportEnabled()) {
      const mail = await importFromAppleMail(tenantId);
      result.appleMail = {
        imported: mail.imported,
        skipped: mail.skipped,
        rejected: mail.rejected,
        candidates: mail.candidates,
        error: mail.errors[0],
      };
    }

    if (appleCalendarImportEnabled()) {
      const calendar = await importFromAppleCalendar(tenantId);
      result.appleCalendar = {
        imported: calendar.imported,
        skipped: calendar.skipped,
        rejected: calendar.rejected,
        candidates: calendar.candidates,
        error: calendar.errors[0],
      };
    }

    if (gongEmailCorrelationEnabled()) {
      result.gong = await correlateGongEmailsForTenant(tenantId);
    }

    try {
      if (await hasMicrosoft365Connection(tenantId)) {
        const email = await syncEmailMessages(tenantId);
        result.internalCalls = {
          scanned: email.internalCallsBackfill?.scanned ?? 0,
          ingested:
            (email.internalCallsBackfill?.ingested ?? 0) +
            (email.ingested ?? 0),
          upgraded: email.internalCallsBackfill?.upgraded ?? 0,
          skipped: email.internalCallsBackfill?.skipped ?? 0,
          personalReplayCandidates: email.personalReplayCandidates,
          error: email.error,
        };
      } else {
        result.internalCalls = await backfillInternalCallReplays(tenantId);
      }
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
  const tenantIds = await tenantIdsWithActivePolicies();
  const tenants: TenantPollResult[] = [];

  for (const tenantId of tenantIds) {
    try {
      tenants.push(await pollTenantIngestion(tenantId));
    } catch (err) {
      tenants.push({
        tenantId,
        webex: {
          error: err instanceof Error ? err.message : "Poll failed",
        },
      });
    }
  }

  return {
    polledAt: new Date().toISOString(),
    tenants,
    durationMs: Date.now() - started,
  };
}

let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function logPollSummary(result: IngestionPollResult): void {
  for (const tenant of result.tenants) {
    const parts: string[] = [];
    const wx = tenant.webex;
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
    if (tenant.appleMail) {
      parts.push(
        `mail +${tenant.appleMail.imported}/${tenant.appleMail.candidates}`
      );
    }
    if (tenant.appleCalendar) {
      parts.push(
        `calendar +${tenant.appleCalendar.imported}/${tenant.appleCalendar.candidates}`
      );
    }
    if (wx?.error) parts.push(`webex error: ${wx.error}`);
    if (tenant.appleMail?.error) parts.push(`mail error: ${tenant.appleMail.error}`);
    if (tenant.gong) {
      parts.push(
        `gong correlated ${tenant.gong.correlated}/${tenant.gong.scanned}`
      );
    }
    if (tenant.appleCalendar?.error) {
      parts.push(`calendar error: ${tenant.appleCalendar.error}`);
    }
    if (parts.length > 0) {
      console.info(`[ingestion-poll] ${tenant.tenantId}: ${parts.join(" · ")}`);
    }
  }
  console.info(
    `[ingestion-poll] completed in ${result.durationMs}ms (${result.tenants.length} tenant(s))`
  );
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

/** Start background polling when ENABLE_INGESTION_POLL=true. */
export function startIngestionPoller(): void {
  if (!ingestionPollEnabled()) return;
  if (pollTimer) return;

  const intervalMs = ingestionPollIntervalMs();
  console.info(
    `[ingestion-poll] enabled — every ${Math.round(intervalMs / 1000)}s`
  );

  void runPollTick();
  pollTimer = setInterval(() => {
    void runPollTick();
  }, intervalMs);
}

export function stopIngestionPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
