import type { Priority } from "@prisma/client";
import { applyUserNextStepOrder } from "./next-step-display";

const PRIORITY_SCORE: Record<Priority, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export interface RankableNextStep {
  id: string;
  assigneeId: string | null;
  createdById?: string | null;
  communicationId: string | null;
  priority: Priority;
  dueAt: Date | null;
  createdAt: Date;
}

export function scoreNextStepForViewer(
  step: RankableNextStep,
  viewerId: string,
  now = new Date()
): number {
  let score = PRIORITY_SCORE[step.priority] ?? 1;

  if (step.assigneeId === viewerId) score += 20;
  if (!step.communicationId) score += 15;
  if (step.createdById === viewerId) score += 5;

  if (step.dueAt) {
    const daysUntil = (step.dueAt.getTime() - now.getTime()) / 86_400_000;
    if (daysUntil < 0) score += 18;
    else if (daysUntil <= 7) score += 14;
    else if (daysUntil <= 14) score += 10;
    else if (daysUntil <= 30) score += 7;
    else if (daysUntil <= 90) score += 3;
  }

  if (!step.assigneeId && step.communicationId) score -= 12;

  return score;
}

export function rankNextStepsForViewer<T extends RankableNextStep>(
  steps: T[],
  viewerId: string,
  orderedIds: string[] | null | undefined,
  now = new Date()
): T[] {
  const ranked = [...steps].sort((a, b) => {
    const scoreDiff =
      scoreNextStepForViewer(b, viewerId, now) -
      scoreNextStepForViewer(a, viewerId, now);
    if (scoreDiff !== 0) return scoreDiff;

    const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;

    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return applyUserNextStepOrder(ranked, orderedIds);
}
