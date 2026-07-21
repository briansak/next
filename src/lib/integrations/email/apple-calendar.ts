import { execFile } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { promisify } from "util";
import type { CalendarEvent } from "./ics";
import { getImportAppConfig } from "@/lib/config/app-config-store";
import type { ResolvedAppConfig } from "@/lib/config/app-config";

const execFileAsync = promisify(execFile);

const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_LOOKAHEAD_DAYS = 30;
const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_TIMEOUT_MS = 120_000;

const SKIP_CALENDARS = new Set([
  "Birthdays",
  "US Holidays",
  "United States holidays",
  "Siri Suggestions",
  "Scheduled Reminders",
]);

export interface AppleCalendarRawEvent {
  calendar: string;
  uid: string;
  summary: string;
  start: string;
  end?: string | null;
  location?: string | null;
  description?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  attendeeEmails?: string[];
  isRecurring?: boolean;
  isAllDay?: boolean;
}

export interface AppleCalendarScanResult {
  calendars: string[];
  events: AppleCalendarRawEvent[];
  warnings: string[];
}

export async function isAppleCalendarImportEnabled(): Promise<boolean> {
  const config = await getImportAppConfig();
  return config.enableAppleCalendarImport;
}

export function appleCalendarImportEnabledFromConfig(
  config: ResolvedAppConfig
): boolean {
  return config.enableAppleCalendarImport;
}

/** Env-only fallback for legacy scripts; prefer isAppleCalendarImportEnabled(). */
export function appleCalendarImportEnabled(): boolean {
  return process.env.ENABLE_APPLE_CALENDAR_IMPORT === "true";
}

export function resolveAppleCalendarScriptPath(): string {
  const configured = process.env.APPLE_CALENDAR_SCRIPT_PATH?.trim();
  if (configured) {
    return expandHome(configured);
  }
  return resolve(process.cwd(), "scripts", "export-apple-calendar.swift");
}

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

export function appleCalendarEnv(calendarNames?: string | null): NodeJS.ProcessEnv {
  const configuredNames =
    normalizeCalendarNames(calendarNames) ??
    normalizeCalendarNames(process.env.APPLE_CALENDAR_NAMES);

  return {
    ...process.env,
    APPLE_CALENDAR_LOOKBACK_DAYS: String(
      Number(process.env.APPLE_CALENDAR_LOOKBACK_DAYS ?? DEFAULT_LOOKBACK_DAYS)
    ),
    APPLE_CALENDAR_LOOKAHEAD_DAYS: String(
      Number(process.env.APPLE_CALENDAR_LOOKAHEAD_DAYS ?? DEFAULT_LOOKAHEAD_DAYS)
    ),
    APPLE_CALENDAR_MAX_EVENTS: String(
      Number(process.env.APPLE_CALENDAR_MAX_EVENTS ?? DEFAULT_MAX_EVENTS)
    ),
    ...(configuredNames ? { APPLE_CALENDAR_NAMES: configuredNames } : {}),
  };
}

function normalizeCalendarNames(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function rawEventToCalendarEvent(raw: AppleCalendarRawEvent): CalendarEvent {
  return {
    uid: raw.uid,
    summary: raw.summary,
    description: raw.description ?? undefined,
    location: raw.location ?? undefined,
    start: new Date(raw.start),
    end: raw.end ? new Date(raw.end) : undefined,
    organizerEmail: raw.organizerEmail ?? undefined,
    organizerName: raw.organizerName ?? undefined,
    attendeeEmails: raw.attendeeEmails ?? [],
    isRecurring: raw.isRecurring ?? false,
    isAllDay: raw.isAllDay ?? false,
  };
}

export async function fetchAppleCalendarEvents(options?: {
  calendarNames?: string | null;
}): Promise<AppleCalendarScanResult> {
  const scriptPath = resolveAppleCalendarScriptPath();
  const timeoutMs = Number(
    process.env.APPLE_CALENDAR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      "swift",
      [scriptPath],
      {
        env: appleCalendarEnv(options?.calendarNames),
        maxBuffer: 20 * 1024 * 1024,
        timeout: timeoutMs,
      }
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error(
        stderr.trim() ||
          "Apple Calendar export returned no data. Check Calendars privacy permission."
      );
    }

    const parsed = JSON.parse(trimmed) as AppleCalendarScanResult & {
      error?: string;
    };
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return {
      calendars: parsed.calendars ?? [],
      events: parsed.events ?? [],
      warnings: parsed.warnings ?? [],
    };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("Calendar access denied") || err.message.includes("exit code 2")) {
        throw new Error(
          "Calendar access denied. Open System Settings → Privacy & Security → Calendars and allow your terminal or IDE, then retry."
        );
      }
      if (err.message.includes("ETIMEDOUT") || err.message.includes("timed out")) {
        throw new Error(
          "Apple Calendar export timed out. Set calendar names in Settings → Email and retry."
        );
      }
    }
    throw err;
  }
}

/** Calendars we skip when APPLE_CALENDAR_NAMES is unset. */
export function isSkippedAppleCalendar(name: string): boolean {
  return SKIP_CALENDARS.has(name);
}
