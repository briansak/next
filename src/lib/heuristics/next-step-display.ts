import { formatFutureDate, formatRelativeAge, sourceLabel } from "../format/display";

export interface NextStepDisplayInput {
  title: string;
  status: string;
  dueAt: Date | null;
  communication: {
    subject: string | null;
    source: string;
    receivedAt: Date | null;
    authorName: string | null;
    excerpt: string | null;
  } | null;
}

const GENERIC_TITLE_PATTERNS: Array<{ pattern: RegExp; kind: "mention" | "answer" | "followup" }> = [
  { pattern: /^respond — you were @mentioned$/i, kind: "mention" },
  { pattern: /^answer the question in this email$/i, kind: "answer" },
  { pattern: /^follow up on unanswered thread$/i, kind: "followup" },
];

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
