import type { CommunicationSource, Prisma } from "@prisma/client";
import { summarizeMeetingTranscript, summarizeWithOllama } from "./ollama";

export const DASHBOARD_SUMMARY_LABELS = {
  "webex-ai": "Webex AI",
  gong: "Gong AI",
  ollama: "AI summary",
  heuristic: "Summary",
} as const;

export type DashboardSummarySource = keyof typeof DASHBOARD_SUMMARY_LABELS;

export interface DashboardSummary {
  text: string;
  source: DashboardSummarySource;
  label: string;
  fromCache: boolean;
}

interface SummaryMetadata {
  dashboardSummaryText?: string;
  dashboardSummarySource?: DashboardSummarySource;
  dashboardSummaryAt?: string;
  summaryText?: string;
  summarySource?: DashboardSummarySource | "none";
  gongSummaryText?: string;
  transcriptText?: string;
  location?: string;
  attendeeEmails?: string[];
  externalAttendees?: string[];
  endTime?: string;
  daysUntil?: number;
}

export interface DashboardSummaryItem {
  id: string;
  tenantId: string;
  source: CommunicationSource;
  subject: string | null;
  body: string;
  excerpt: string | null;
  summary: string | null;
  authorName: string | null;
  metadata: unknown;
}

export function dashboardSummariesEnabled(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function plainText(body: string): string {
  if (body.includes("<") && body.includes(">")) {
    return stripHtml(body);
  }
  return body.replace(/\s+/g, " ").trim();
}

export function buildHeuristicDashboardSummary(
  item: DashboardSummaryItem
): DashboardSummary {
  const subject = item.subject?.trim();
  const body = plainText(item.body);
  const sentences =
    body.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter((s) => s.length > 12) ??
    [];

  let text = sentences.slice(0, 2).join(" ") || body.slice(0, 320);
  if (!text && item.summary) text = item.summary;
  if (!text && item.excerpt) text = item.excerpt;
  if (!text && subject) text = subject;
  if (!text) text = "No summary available.";

  if (subject && text !== subject && !text.startsWith(subject)) {
    text = `${subject}: ${text}`;
  }

  return {
    text: text.slice(0, 500),
    source: "heuristic",
    label: DASHBOARD_SUMMARY_LABELS.heuristic,
    fromCache: false,
  };
}

function meetingSummaryFromMetadata(
  meta: SummaryMetadata
): DashboardSummary | null {
  const gong = meta.gongSummaryText?.trim();
  if (gong) {
    return {
      text: gong,
      source: "gong",
      label: DASHBOARD_SUMMARY_LABELS.gong,
      fromCache: true,
    };
  }

  const summary = meta.summaryText?.trim();
  if (summary) {
    const source =
      meta.summarySource === "ollama"
        ? "ollama"
        : meta.summarySource === "gong"
          ? "gong"
          : "webex-ai";
    return {
      text: summary,
      source,
      label: DASHBOARD_SUMMARY_LABELS[source],
      fromCache: true,
    };
  }

  return null;
}

function cachedDashboardSummary(
  meta: SummaryMetadata
): DashboardSummary | null {
  const text = meta.dashboardSummaryText?.trim();
  if (!text) return null;

  const source = meta.dashboardSummarySource ?? "ollama";
  return {
    text,
    source,
    label: DASHBOARD_SUMMARY_LABELS[source] ?? DASHBOARD_SUMMARY_LABELS.ollama,
    fromCache: true,
  };
}

function buildSummaryContext(item: DashboardSummaryItem): string {
  const meta = (item.metadata ?? {}) as SummaryMetadata;

  if (item.source === "WEBEX_MEETING") {
    const parts = [
      "Webex meeting recap for a partner coverage dashboard.",
      item.subject ? `Title: ${item.subject}` : null,
      item.authorName ? `Host: ${item.authorName}` : null,
      meta.transcriptText
        ? `Transcript excerpt: ${meta.transcriptText.slice(0, 4000)}`
        : null,
    ];
    return parts.filter(Boolean).join("\n");
  }

  if (item.source === "OUTLOOK_CALENDAR") {
    const attendees =
      meta.externalAttendees?.join(", ") ||
      meta.attendeeEmails?.join(", ") ||
      null;
    const parts = [
      "Upcoming calendar event that may need planning or coordination.",
      item.subject ? `Event: ${item.subject}` : null,
      meta.location ? `Location: ${meta.location}` : null,
      meta.daysUntil != null ? `Days until event: ${meta.daysUntil}` : null,
      attendees ? `Attendees: ${attendees}` : null,
      item.summary ? `Planning notes: ${item.summary}` : null,
    ];
    return parts.filter(Boolean).join("\n");
  }

  if (item.source === "WEBEX") {
    return "Webex space message for a partner coverage dashboard.";
  }

  return "Email or team communication for a partner coverage dashboard.";
}

function buildSummaryBody(item: DashboardSummaryItem): string {
  const meta = (item.metadata ?? {}) as SummaryMetadata;
  const body = plainText(item.body);

  if (item.source === "WEBEX_MEETING") {
    return [
      item.subject,
      item.summary,
      meta.transcriptText?.slice(0, 6000),
      body,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [item.subject, body || item.summary || item.excerpt]
    .filter(Boolean)
    .join("\n\n");
}

export function pickExistingDashboardSummary(
  item: DashboardSummaryItem
): DashboardSummary | null {
  const meta = (item.metadata ?? {}) as SummaryMetadata;

  if (item.source === "WEBEX_MEETING") {
    const meeting = meetingSummaryFromMetadata(meta);
    if (meeting?.source === "gong") return meeting;
  }

  const cached = cachedDashboardSummary(meta);
  if (cached) return cached;

  if (item.source === "WEBEX_MEETING") {
    return meetingSummaryFromMetadata(meta);
  }

  return null;
}

export async function resolveDashboardSummary(
  item: DashboardSummaryItem
): Promise<DashboardSummary> {
  const existing = pickExistingDashboardSummary(item);
  if (existing) return existing;

  const body = buildSummaryBody(item);
  if (!body.trim() && !item.subject) {
    return buildHeuristicDashboardSummary(item);
  }

  if (item.source === "WEBEX_MEETING") {
    const meta = (item.metadata ?? {}) as SummaryMetadata;
    if (meta.transcriptText?.trim()) {
      const transcriptSummary = await summarizeMeetingTranscript(
        meta.transcriptText,
        item.subject ?? "Meeting"
      );
      if (transcriptSummary?.summary) {
        return {
          text: transcriptSummary.summary,
          source: "ollama",
          label: DASHBOARD_SUMMARY_LABELS.ollama,
          fromCache: false,
        };
      }
    }
  }

  if (dashboardSummariesEnabled()) {
    const ai = await summarizeWithOllama({
      subject: item.subject ?? undefined,
      body,
      context: buildSummaryContext(item),
    });
    if (ai?.summary?.trim()) {
      return {
        text: ai.summary.trim(),
        source: "ollama",
        label: DASHBOARD_SUMMARY_LABELS.ollama,
        fromCache: false,
      };
    }
  }

  return buildHeuristicDashboardSummary(item);
}

async function persistDashboardSummary(
  item: DashboardSummaryItem,
  summary: DashboardSummary
): Promise<void> {
  if (summary.fromCache) return;

  const { prisma } = await import("@/lib/db");
  const meta = (item.metadata ?? {}) as SummaryMetadata;
  await prisma.communication.update({
    where: { id: item.id },
    data: {
      metadata: {
        ...meta,
        dashboardSummaryText: summary.text,
        dashboardSummarySource: summary.source,
        dashboardSummaryAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function resolveDashboardSummaries(
  items: DashboardSummaryItem[],
  options?: { maxGenerations?: number; concurrency?: number }
): Promise<Map<string, DashboardSummary>> {
  const maxGenerations = options?.maxGenerations ?? 12;
  const concurrency = options?.concurrency ?? 4;
  const result = new Map<string, DashboardSummary>();

  const immediate: DashboardSummaryItem[] = [];
  const needsGeneration: DashboardSummaryItem[] = [];

  for (const item of items) {
    const existing = pickExistingDashboardSummary(item);
    if (existing) {
      result.set(item.id, existing);
    } else {
      needsGeneration.push(item);
    }
  }

  const toGenerate = needsGeneration.slice(0, maxGenerations);
  const generated = await mapWithConcurrency(toGenerate, concurrency, async (item) => {
    const summary = await resolveDashboardSummary(item);
    await persistDashboardSummary(item, summary).catch(() => undefined);
    return { id: item.id, summary };
  });

  for (const entry of generated) {
    result.set(entry.id, entry.summary);
  }

  for (const item of needsGeneration.slice(maxGenerations)) {
    result.set(item.id, buildHeuristicDashboardSummary(item));
  }

  return result;
}
