import { z } from "zod";

const DEFAULT_PARTNER_ASK_SLA_HOURS = 48;
const DEFAULT_POLL_INTERVAL_MS = 300_000;
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
const MIN_POLL_INTERVAL_MS = 60_000;
const MAX_POLL_INTERVAL_MS = 3_600_000;

const storedAppConfigSchema = z
  .object({
    ollamaBaseUrl: z.string().trim().max(512).nullable().optional(),
    ollamaModel: z.string().trim().min(1).max(128).nullable().optional(),
    enableIngestionPoll: z.boolean().optional(),
    ingestionPollIntervalMs: z.number().int().min(MIN_POLL_INTERVAL_MS).max(MAX_POLL_INTERVAL_MS).optional(),
    enableGongEmailCorrelation: z.boolean().optional(),
    enableMeetingOllamaSummary: z.boolean().optional(),
    partnerAskSlaHours: z.number().int().min(1).max(720).optional(),
  })
  .strict();

export type StoredAppConfig = z.infer<typeof storedAppConfigSchema>;

export interface ResolvedAppConfig {
  ollamaBaseUrl: string | null;
  ollamaModel: string;
  enableIngestionPoll: boolean;
  ingestionPollIntervalMs: number;
  enableGongEmailCorrelation: boolean;
  enableMeetingOllamaSummary: boolean;
  partnerAskSlaHours: number;
}

export interface OllamaRuntimeSettings {
  baseUrl: string;
  model: string;
}

export const patchAppConfigSchema = z
  .object({
    ollamaBaseUrl: z
      .string()
      .trim()
      .max(512)
      .nullable()
      .optional()
      .refine(
        (value) =>
          value == null ||
          value === "" ||
          /^https?:\/\/.+/i.test(value),
        "Ollama URL must start with http:// or https://"
      ),
    ollamaModel: z.string().trim().min(1).max(128).nullable().optional(),
    enableIngestionPoll: z.boolean().optional(),
    ingestionPollIntervalMs: z
      .number()
      .int()
      .min(MIN_POLL_INTERVAL_MS)
      .max(MAX_POLL_INTERVAL_MS)
      .optional(),
    enableGongEmailCorrelation: z.boolean().optional(),
    enableMeetingOllamaSummary: z.boolean().optional(),
    partnerAskSlaHours: z.number().int().min(1).max(720).optional(),
  })
  .strict();

export type PatchAppConfigInput = z.infer<typeof patchAppConfigSchema>;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function envAppConfigDefaults(): ResolvedAppConfig {
  const pollInterval = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? `${DEFAULT_POLL_INTERVAL_MS}`);
  return {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || null,
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    enableIngestionPoll: process.env.ENABLE_INGESTION_POLL === "true",
    ingestionPollIntervalMs:
      Number.isFinite(pollInterval) && pollInterval >= MIN_POLL_INTERVAL_MS
        ? pollInterval
        : DEFAULT_POLL_INTERVAL_MS,
    enableGongEmailCorrelation: process.env.ENABLE_GONG_EMAIL_CORRELATION !== "false",
    enableMeetingOllamaSummary: process.env.ENABLE_MEETING_OLLAMA_SUMMARY === "true",
    partnerAskSlaHours: parsePositiveInt(
      process.env.PARTNER_ASK_SLA_HOURS,
      DEFAULT_PARTNER_ASK_SLA_HOURS
    ),
  };
}

export function parseStoredAppConfig(raw: unknown): StoredAppConfig {
  if (!raw || typeof raw !== "object") return {};
  const parsed = storedAppConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function normalizeOllamaBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

export function resolveAppConfig(storedRaw: unknown): ResolvedAppConfig {
  const envDefaults = envAppConfigDefaults();
  const stored = parseStoredAppConfig(storedRaw);

  return {
    ollamaBaseUrl:
      stored.ollamaBaseUrl !== undefined
        ? normalizeOllamaBaseUrl(stored.ollamaBaseUrl)
        : envDefaults.ollamaBaseUrl,
    ollamaModel:
      stored.ollamaModel !== undefined && stored.ollamaModel
        ? stored.ollamaModel
        : envDefaults.ollamaModel,
    enableIngestionPoll:
      stored.enableIngestionPoll !== undefined
        ? stored.enableIngestionPoll
        : envDefaults.enableIngestionPoll,
    ingestionPollIntervalMs:
      stored.ingestionPollIntervalMs !== undefined
        ? stored.ingestionPollIntervalMs
        : envDefaults.ingestionPollIntervalMs,
    enableGongEmailCorrelation:
      stored.enableGongEmailCorrelation !== undefined
        ? stored.enableGongEmailCorrelation
        : envDefaults.enableGongEmailCorrelation,
    enableMeetingOllamaSummary:
      stored.enableMeetingOllamaSummary !== undefined
        ? stored.enableMeetingOllamaSummary
        : envDefaults.enableMeetingOllamaSummary,
    partnerAskSlaHours:
      stored.partnerAskSlaHours !== undefined
        ? stored.partnerAskSlaHours
        : envDefaults.partnerAskSlaHours,
  };
}

export function ollamaRuntimeFromConfig(
  config: ResolvedAppConfig
): OllamaRuntimeSettings | null {
  if (!config.ollamaBaseUrl) return null;
  return {
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
  };
}

export function ollamaAvailableFromConfig(config: ResolvedAppConfig): boolean {
  return Boolean(config.ollamaBaseUrl);
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  if (!normalized) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${normalized}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };

    return (data.models ?? [])
      .map((entry) => entry.name?.trim() || entry.model?.trim() || "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
