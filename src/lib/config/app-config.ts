import { z } from "zod";

const DEFAULT_PARTNER_ASK_SLA_HOURS = 48;
const DEFAULT_POLL_INTERVAL_MS = 300_000;
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
const DEFAULT_WEBEX_SCOPE_MODE = "standard+meetings+vidcast";
const DEFAULT_APP_PUBLIC_URL = "http://localhost:3000";
const DEFAULT_WHISPER_BIN = ".venv/bin/whisper";
const DEFAULT_WHISPER_MODEL = "tiny";
const DEFAULT_READPST_BIN = "readpst";
const DEFAULT_UNZIP_BIN = "unzip";
const DEFAULT_APPLE_MAIL_LOOKBACK_DAYS = 14;
const MIN_POLL_INTERVAL_MS = 60_000;
const MAX_POLL_INTERVAL_MS = 3_600_000;

const webexScopeModeSchema = z.enum([
  "standard",
  "standard+meetings",
  "standard+meetings+vidcast",
  "compliance",
  "standard+webhooks",
  "compliance+webhooks",
  "custom",
]);

const sharedAppConfigFields = {
  ollamaBaseUrl: z.string().trim().max(512).nullable().optional(),
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
  enableAppleMailImport: z.boolean().optional(),
  enableAppleCalendarImport: z.boolean().optional(),
  appleCalendarNames: z.string().trim().max(512).nullable().optional(),
  appPublicUrl: z.string().trim().max(512).nullable().optional(),
  webexScopeMode: webexScopeModeSchema.optional(),
  webexCustomScopes: z.string().trim().max(2048).nullable().optional(),
  webexMcpUrl: z.string().trim().max(512).nullable().optional(),
  webexRedirectUri: z.string().trim().max(512).nullable().optional(),
  enablePstImport: z.boolean().optional(),
  readpstBin: z.string().trim().max(256).optional(),
  unzipBin: z.string().trim().max(256).optional(),
  enableRecordingTranscription: z.boolean().optional(),
  whisperBin: z.string().trim().max(256).optional(),
  whisperModel: z.string().trim().max(64).optional(),
  appleMailPath: z.string().trim().max(512).nullable().optional(),
  appleMailLookbackDays: z.number().int().min(1).max(365).optional(),
};

const storedAppConfigSchema = z.object(sharedAppConfigFields).strict();

export type StoredAppConfig = z.infer<typeof storedAppConfigSchema>;

export interface ResolvedAppConfig {
  ollamaBaseUrl: string | null;
  ollamaModel: string;
  enableIngestionPoll: boolean;
  ingestionPollIntervalMs: number;
  enableGongEmailCorrelation: boolean;
  enableMeetingOllamaSummary: boolean;
  partnerAskSlaHours: number;
  enableAppleMailImport: boolean;
  enableAppleCalendarImport: boolean;
  appleCalendarNames: string | null;
  appPublicUrl: string;
  webexScopeMode: z.infer<typeof webexScopeModeSchema>;
  webexCustomScopes: string | null;
  webexMcpUrl: string | null;
  webexRedirectUri: string | null;
  enablePstImport: boolean;
  readpstBin: string;
  unzipBin: string;
  enableRecordingTranscription: boolean;
  whisperBin: string;
  whisperModel: string;
  appleMailPath: string | null;
  appleMailLookbackDays: number;
}

export interface OllamaRuntimeSettings {
  baseUrl: string;
  model: string;
}

export const patchAppConfigSchema = z
  .object({
    ...sharedAppConfigFields,
    ollamaBaseUrl: sharedAppConfigFields.ollamaBaseUrl.refine(
      (value) =>
        value == null ||
        value === "" ||
        /^https?:\/\/.+/i.test(value),
      "Ollama URL must start with http:// or https://"
    ),
    appPublicUrl: sharedAppConfigFields.appPublicUrl.refine(
      (value) =>
        value == null ||
        value === "" ||
        /^https?:\/\/.+/i.test(value),
      "App URL must start with http:// or https://"
    ),
    webexRedirectUri: sharedAppConfigFields.webexRedirectUri.refine(
      (value) =>
        value == null ||
        value === "" ||
        /^https?:\/\/.+/i.test(value),
      "Redirect URI must start with http:// or https://"
    ),
    webexMcpUrl: sharedAppConfigFields.webexMcpUrl.refine(
      (value) =>
        value == null ||
        value === "" ||
        /^https?:\/\/.+/i.test(value),
      "MCP URL must start with http:// or https://"
    ),
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
  const customScopes = process.env.WEBEX_SCOPES?.trim() || null;
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
    enableAppleMailImport: process.env.ENABLE_APPLE_MAIL_IMPORT === "true",
    enableAppleCalendarImport: process.env.ENABLE_APPLE_CALENDAR_IMPORT === "true",
    appleCalendarNames: normalizeAppleCalendarNames(process.env.APPLE_CALENDAR_NAMES),
    appPublicUrl:
      normalizeAppPublicUrl(process.env.NEXT_PUBLIC_APP_URL) ?? DEFAULT_APP_PUBLIC_URL,
    webexScopeMode: customScopes
      ? "custom"
      : ((process.env.WEBEX_SCOPE_MODE?.trim() ||
          DEFAULT_WEBEX_SCOPE_MODE) as ResolvedAppConfig["webexScopeMode"]),
    webexCustomScopes: customScopes,
    webexMcpUrl: normalizeOptionalUrl(process.env.WEBEX_MCP_URL),
    webexRedirectUri: normalizeOptionalUrl(process.env.WEBEX_REDIRECT_URI),
    enablePstImport: process.env.ENABLE_PST_IMPORT === "true",
    readpstBin: process.env.READPST_BIN?.trim() || DEFAULT_READPST_BIN,
    unzipBin: process.env.UNZIP_BIN?.trim() || DEFAULT_UNZIP_BIN,
    enableRecordingTranscription: process.env.ENABLE_RECORDING_TRANSCRIPTION === "true",
    whisperBin: process.env.WHISPER_BIN?.trim() || DEFAULT_WHISPER_BIN,
    whisperModel: process.env.WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL,
    appleMailPath: process.env.APPLE_MAIL_PATH?.trim() || null,
    appleMailLookbackDays: parsePositiveInt(
      process.env.APPLE_MAIL_LOOKBACK_DAYS,
      DEFAULT_APPLE_MAIL_LOOKBACK_DAYS
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

export function normalizeAppleCalendarNames(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function normalizeAppPublicUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

export function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

export function defaultWebexRedirectUri(appPublicUrl: string): string {
  return `${normalizeAppPublicUrl(appPublicUrl) ?? DEFAULT_APP_PUBLIC_URL}/api/integrations/webex/callback`;
}

function resolveStoredField<T>(
  storedValue: T | undefined,
  envDefault: T
): T {
  return storedValue !== undefined ? storedValue : envDefault;
}

export function resolveAppConfig(storedRaw: unknown): ResolvedAppConfig {
  const envDefaults = envAppConfigDefaults();
  const stored = parseStoredAppConfig(storedRaw);

  const appPublicUrl =
    stored.appPublicUrl !== undefined
      ? normalizeAppPublicUrl(stored.appPublicUrl) ?? DEFAULT_APP_PUBLIC_URL
      : envDefaults.appPublicUrl;

  return {
    ollamaBaseUrl:
      stored.ollamaBaseUrl !== undefined
        ? normalizeOllamaBaseUrl(stored.ollamaBaseUrl)
        : envDefaults.ollamaBaseUrl,
    ollamaModel:
      stored.ollamaModel !== undefined && stored.ollamaModel
        ? stored.ollamaModel
        : envDefaults.ollamaModel,
    enableIngestionPoll: resolveStoredField(
      stored.enableIngestionPoll,
      envDefaults.enableIngestionPoll
    ),
    ingestionPollIntervalMs: resolveStoredField(
      stored.ingestionPollIntervalMs,
      envDefaults.ingestionPollIntervalMs
    ),
    enableGongEmailCorrelation: resolveStoredField(
      stored.enableGongEmailCorrelation,
      envDefaults.enableGongEmailCorrelation
    ),
    enableMeetingOllamaSummary: resolveStoredField(
      stored.enableMeetingOllamaSummary,
      envDefaults.enableMeetingOllamaSummary
    ),
    partnerAskSlaHours: resolveStoredField(
      stored.partnerAskSlaHours,
      envDefaults.partnerAskSlaHours
    ),
    enableAppleMailImport: resolveStoredField(
      stored.enableAppleMailImport,
      envDefaults.enableAppleMailImport
    ),
    enableAppleCalendarImport: resolveStoredField(
      stored.enableAppleCalendarImport,
      envDefaults.enableAppleCalendarImport
    ),
    appleCalendarNames:
      stored.appleCalendarNames !== undefined
        ? normalizeAppleCalendarNames(stored.appleCalendarNames)
        : envDefaults.appleCalendarNames,
    appPublicUrl,
    webexScopeMode: resolveStoredField(stored.webexScopeMode, envDefaults.webexScopeMode),
    webexCustomScopes:
      stored.webexCustomScopes !== undefined
        ? stored.webexCustomScopes?.trim() || null
        : envDefaults.webexCustomScopes,
    webexMcpUrl:
      stored.webexMcpUrl !== undefined
        ? normalizeOptionalUrl(stored.webexMcpUrl)
        : envDefaults.webexMcpUrl,
    webexRedirectUri:
      stored.webexRedirectUri !== undefined
        ? normalizeOptionalUrl(stored.webexRedirectUri)
        : envDefaults.webexRedirectUri,
    enablePstImport: resolveStoredField(stored.enablePstImport, envDefaults.enablePstImport),
    readpstBin: resolveStoredField(stored.readpstBin, envDefaults.readpstBin),
    unzipBin: resolveStoredField(stored.unzipBin, envDefaults.unzipBin),
    enableRecordingTranscription: resolveStoredField(
      stored.enableRecordingTranscription,
      envDefaults.enableRecordingTranscription
    ),
    whisperBin: resolveStoredField(stored.whisperBin, envDefaults.whisperBin),
    whisperModel: resolveStoredField(stored.whisperModel, envDefaults.whisperModel),
    appleMailPath:
      stored.appleMailPath !== undefined
        ? stored.appleMailPath?.trim() || null
        : envDefaults.appleMailPath,
    appleMailLookbackDays: resolveStoredField(
      stored.appleMailLookbackDays,
      envDefaults.appleMailLookbackDays
    ),
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
