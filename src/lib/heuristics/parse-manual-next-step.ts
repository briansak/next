import type { Priority } from "@prisma/client";
import {
  analyzeCommunication,
  scoreToPriority,
  type MentionUser,
} from "./index";

export interface ParsedManualNextStep {
  title: string;
  summary: string;
  priority: Priority;
  priorityScore: number;
  priorityReasons: string[];
  dueAt: Date | null;
  suggestedAction?: string;
  tags: string[];
}

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const DATE_PATTERNS: RegExp[] = [
  /\b(?:due|by|deadline|submit(?:ted)?(?:\s+by)?|closes?|until)\s*:?\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\s*(?:due|deadline)\b/i,
  /\buntil\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  /\b(?:due|by|deadline)\s*:?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i,
  /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
];

export function extractDueDateFromText(
  text: string,
  now = new Date()
): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    let month: number | null = null;
    let day: number | null = null;
    let year: number | null = null;

    if (/^\d+$/.test(match[1] ?? "")) {
      month = Number(match[1]) - 1;
      day = Number(match[2]);
      year = match[3] ? normalizeYear(Number(match[3])) : null;
    } else {
      month = MONTHS[(match[1] ?? "").toLowerCase()] ?? null;
      day = Number(match[2]);
      year = match[3] ? normalizeYear(Number(match[3])) : null;
    }

    if (month === null || !day || day < 1 || day > 31) continue;

    const resolvedYear = year ?? inferYear(month, day, now);
    const candidate = new Date(resolvedYear, month, day, 17, 0, 0, 0);
    if (Number.isNaN(candidate.getTime())) continue;
    return candidate;
  }

  return null;
}

function normalizeYear(value: number): number {
  if (value < 100) return 2000 + value;
  return value;
}

function inferYear(month: number, day: number, now: Date): number {
  const year = now.getFullYear();
  const candidate = new Date(year, month, day, 17, 0, 0, 0);
  if (candidate.getTime() >= startOfDay(now).getTime()) {
    return year;
  }
  return year + 1;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function extractSubjectLine(text: string): string {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const keywordLine = lines.find((line) =>
    /\bcfp\b|call for papers|submission|proposal|register|renew|deadline|due\b/i.test(
      line
    )
  );

  if (keywordLine && keywordLine.length <= 140) {
    return cleanupTitle(keywordLine);
  }

  const first = lines[0] ?? "New next step";
  if (first.length <= 120) return cleanupTitle(first);
  return `${cleanupTitle(first.slice(0, 117))}…`;
}

function isGenericSuggestedAction(action?: string): boolean {
  if (!action?.trim()) return true;
  return [
    /^review and respond\b/i,
    /^check deadline\b/i,
    /^follow up\b/i,
    /^review attached\b/i,
    /^respond — you were\b/i,
    /^answer the question\b/i,
  ].some((pattern) => pattern.test(action.trim()));
}

function cleanupTitle(line: string): string {
  return line
    .replace(/\s*(?:due|deadline|by)\s+[A-Za-z0-9,/]+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyDueDatePriorityBoost(
  score: number,
  dueAt: Date | null,
  now: Date
): { score: number; reasons: string[] } {
  if (!dueAt) return { score, reasons: [] };

  const daysUntil = (dueAt.getTime() - now.getTime()) / 86_400_000;
  const reasons: string[] = [];

  if (daysUntil <= 3) {
    reasons.push("Due within 3 days");
    return { score: Math.min(10, score + 2), reasons };
  }
  if (daysUntil <= 14) {
    reasons.push("Due within 2 weeks");
    return { score: Math.min(10, score + 1), reasons };
  }

  return { score, reasons };
}

export function parseManualNextStep(
  rawText: string,
  options?: {
    now?: Date;
    teamMembers?: MentionUser[];
    viewer?: MentionUser;
  }
): ParsedManualNextStep {
  const now = options?.now ?? new Date();
  const text = rawText.trim();
  const subject = extractSubjectLine(text);
  const dueAt = extractDueDateFromText(text, now);

  const analysis = analyzeCommunication({
    body: text,
    subject,
    receivedAt: now,
    teamMembers: options?.teamMembers,
    viewer: options?.viewer,
  });

  const dueBoost = applyDueDatePriorityBoost(
    analysis.priorityScore,
    dueAt,
    now
  );
  let priorityScore = dueBoost.score;
  const priorityReasons = [...analysis.priorityReasons, ...dueBoost.reasons];

  if (dueAt) {
    priorityScore = Math.max(priorityScore, 4);
    if (!priorityReasons.some((reason) => reason.includes("due date"))) {
      priorityReasons.push("Extracted due date");
    }
  }

  const priority = scoreToPriority(priorityScore);

  const title = !isGenericSuggestedAction(analysis.suggestedAction)
    ? analysis.suggestedAction!.slice(0, 200)
    : subject.slice(0, 200);

  const dueNote = dueAt
    ? `Due ${dueAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}.`
    : null;

  const summaryBody = analysis.summary.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  const summary = dueNote ? `${summaryBody} ${dueNote}`.trim() : summaryBody;

  return {
    title,
    summary,
    priority,
    priorityScore,
    priorityReasons,
    dueAt,
    suggestedAction: analysis.suggestedAction,
    tags: [...analysis.tags, "manual"],
  };
}
