import type { Priority } from "@prisma/client";
import { scoreToPriority } from "./index";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Penalty applied as messages age — tuned for daily start/end-of-day review. */
export function ageDecayPenalty(receivedAt: Date, now = new Date()): number {
  const daysOld = Math.max(
    0,
    Math.floor((now.getTime() - receivedAt.getTime()) / MS_PER_DAY)
  );

  if (daysOld === 0) return 0;
  if (daysOld === 1) return 1;
  if (daysOld <= 3) return 2;
  if (daysOld <= 7) return 3;
  return 5;
}

const ACTION_TAGS = [
  "action-required",
  "deadline",
  "unanswered",
  "mention",
  "mentioned-you",
  "directed-question",
  "meeting",
  "ai-summary",
  "your-action",
  "calendar",
  "plan-ahead",
  "coordination",
  "big-rock",
  "needs-prep",
] as const;

/** Whether message content still warrants surfacing as an actionable item. */
export function warrantsAction(tags: string[]): boolean {
  if (
    tags.includes("calendar-hold") ||
    tags.includes("routine") ||
    tags.includes("travel-logistics")
  ) {
    return false;
  }
  const hasActionSignal = ACTION_TAGS.some((tag) => tags.includes(tag));
  if (!hasActionSignal) return false;
  if (tags.includes("noise") && !tags.includes("mentioned-you")) return false;
  return true;
}

export interface DashboardScoreInput {
  baseScore: number;
  receivedAt: Date;
  tags: string[];
  mentionedYou: boolean;
  /** Communication already has an open/in-progress next step */
  hasOpenNextStep: boolean;
  now?: Date;
}

export interface DashboardScoreResult {
  score: number;
  priority: Priority;
  mentionedYou: boolean;
  adjustments: string[];
  /** Effective score is low — surfaced for awareness but not urgent */
  deprioritized: boolean;
}

export const TRACKED_ACTION_PENALTY = 3;
export const NO_ACTION_PENALTY = 4;
export const DASHBOARD_MIN_SCORE = 2;

export function computeDashboardScore(
  input: DashboardScoreInput
): DashboardScoreResult {
  const now = input.now ?? new Date();
  const adjustments: string[] = [];
  let score = input.baseScore;

  const agePenalty = ageDecayPenalty(input.receivedAt, now);
  if (agePenalty > 0) {
    score -= agePenalty;
    const daysOld = Math.floor(
      (now.getTime() - input.receivedAt.getTime()) / MS_PER_DAY
    );
    adjustments.push(
      daysOld === 1 ? "From yesterday" : `${daysOld} days old`
    );
  }

  if (input.hasOpenNextStep) {
    score -= TRACKED_ACTION_PENALTY;
    adjustments.push("Action item already tracked");
  }

  if (!warrantsAction(input.tags)) {
    score -= NO_ACTION_PENALTY;
    adjustments.push("No clear action needed");
  }

  if (input.tags.includes("calendar-hold") || input.tags.includes("routine")) {
    score = 0;
    adjustments.push("Calendar hold — informational only");
  }

  score = Math.max(0, Math.min(10, score));
  const deprioritized = score < DASHBOARD_MIN_SCORE;

  return {
    score,
    priority: scoreToPriority(score),
    mentionedYou: input.mentionedYou,
    adjustments,
    deprioritized,
  };
}
