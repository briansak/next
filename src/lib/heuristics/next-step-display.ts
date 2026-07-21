import { formatFutureDate, formatRelativeAge, sourceLabel } from "../format/display";
import { digestSummaryPreview } from "./email-digest-summary";

export interface NextStepDisplayInput {
  title: string;
  status: string;
  dueAt: Date | null;
  description?: string | null;
  communication: {
    subject: string | null;
    source: string;
    receivedAt: Date | null;
    authorName: string | null;
    excerpt: string | null;
    summary?: string | null;
  } | null;
}

export interface NextStepSummaryDisplay {
  text: string;
  label: string;
  source?: string | null;
}

export interface NextStepCardDisplay {
  headline: string;
  meta: string;
  summary?: NextStepSummaryDisplay | null;
}

const GENERIC_REVIEW_TITLE = /^review attached content or proposal$/i;

const GENERIC_TITLE_PATTERNS: Array<{ pattern: RegExp; kind: "mention" | "answer" | "followup" }> = [
  { pattern: /^respond — you were @mentioned$/i, kind: "mention" },
  { pattern: /^answer the question in this email$/i, kind: "answer" },
  { pattern: /^follow up on unanswered thread$/i, kind: "followup" },
];

export function isGenericReviewNextStep(title: string): boolean {
  return GENERIC_REVIEW_TITLE.test(title.trim());
}

function truncateSubject(subject: string, max = 72): string {
  const trimmed = subject.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

function subjectContext(input: NextStepDisplayInput): string | null {
  const subject = input.communication?.subject?.trim();
  if (subject) return truncateSubject(subject);

  const excerpt = input.communication?.excerpt?.trim();
  if (excerpt) return truncateSubject(excerpt, 88);

  return null;
}

function titleAlreadyIncludesContext(title: string, context: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const fragment = context.toLowerCase().slice(0, Math.min(24, context.length));
  return fragment.length >= 8 && normalizedTitle.includes(fragment);
}

export function formatNextStepHeadline(input: NextStepDisplayInput): string {
  const context = subjectContext(input);
  const title = input.title.trim();

  for (const { pattern, kind } of GENERIC_TITLE_PATTERNS) {
    if (!pattern.test(title)) continue;
    if (!context) return title;

    if (kind === "mention") {
      return `Respond — @mentioned in “${context}”`;
    }
    if (kind === "answer") {
      return `Answer: “${context}”`;
    }
    return `Follow up: “${context}”`;
  }

  if (context && !titleAlreadyIncludesContext(title, context)) {
    return `${title} · ${context}`;
  }

  return title;
}

function resolveReviewSummaryText(
  input: NextStepDisplayInput,
  dashboardSummary?: NextStepSummaryDisplay | null
): string | null {
  const candidates = [
    dashboardSummary?.text,
    input.communication?.summary,
    input.communication?.excerpt,
    input.communication?.subject,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    return trimmed.includes("\n- ")
      ? digestSummaryPreview(trimmed, 4)
      : trimmed;
  }

  return null;
}

export function formatNextStepCardDisplay(
  input: NextStepDisplayInput,
  dashboardSummary?: NextStepSummaryDisplay | null
): NextStepCardDisplay {
  const manualSummary = input.description?.trim();
  if (manualSummary && !input.communication) {
    return {
      headline: formatNextStepHeadline(input),
      meta: formatNextStepMeta(input),
      summary: {
        text: manualSummary,
        label: "Summary",
        source: "manual",
      },
    };
  }

  if (isGenericReviewNextStep(input.title)) {
    const summaryText = resolveReviewSummaryText(input, dashboardSummary);
    if (summaryText) {
      return {
        headline: input.communication?.subject?.trim() || "Review needed",
        meta: formatNextStepMeta(input),
        summary: {
          text: summaryText,
          label: dashboardSummary?.label ?? "Summary",
          source: dashboardSummary?.source ?? null,
        },
      };
    }
  }

  return {
    headline: formatNextStepHeadline(input),
    meta: formatNextStepMeta(input),
    summary: null,
  };
}

export function formatNextStepMeta(input: NextStepDisplayInput): string {
  const parts: string[] = [input.status.replace(/_/g, " ")];

  const communication = input.communication;
  if (communication) {
    parts.push(sourceLabel(communication.source));

    if (communication.authorName?.trim()) {
      parts.push(`from ${communication.authorName.trim()}`);
    }

    if (communication.receivedAt) {
      const isFutureCalendar =
        communication.source === "OUTLOOK_CALENDAR" &&
        communication.receivedAt.getTime() > Date.now();
      parts.push(
        isFutureCalendar
          ? formatFutureDate(communication.receivedAt)
          : formatRelativeAge(communication.receivedAt)
      );
    }
  } else if (input.description?.trim()) {
    parts.push("Manual");
  }

  if (input.dueAt) {
    const due = formatFutureDate(input.dueAt);
    if (!parts.includes(due)) {
      parts.push(`Due ${due}`);
    }
  }

  return parts.join(" · ");
}

export function applyUserNextStepOrder<T extends { id: string }>(
  steps: T[],
  orderedIds: string[] | null | undefined
): T[] {
  if (!orderedIds?.length) return steps;

  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...steps].sort((a, b) => {
    const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
}
