import type { Priority } from "@prisma/client";

export interface ViewerPriorityOverride {
  priority: Priority;
  priorityScore: number;
  hidden?: boolean;
  updatedAt: string;
}

export interface CommunicationMetadataWithOverrides {
  viewerOverrides?: Record<string, ViewerPriorityOverride>;
}

export const PRIORITY_SCORES: Record<Priority, number> = {
  CRITICAL: 9,
  HIGH: 7,
  MEDIUM: 5,
  LOW: 3,
  INFO: 1,
};

export function priorityToScore(priority: Priority): number {
  return PRIORITY_SCORES[priority];
}

export function getViewerOverride(
  metadata: unknown,
  userId: string
): ViewerPriorityOverride | null {
  const meta = (metadata ?? {}) as CommunicationMetadataWithOverrides;
  return meta.viewerOverrides?.[userId] ?? null;
}

export function applyViewerPriorityOverride(
  baseScore: number,
  basePriority: Priority,
  metadata: unknown,
  userId: string
): {
  score: number;
  priority: Priority;
  hidden: boolean;
  overridden: boolean;
} {
  const override = getViewerOverride(metadata, userId);
  if (!override) {
    return {
      score: baseScore,
      priority: basePriority,
      hidden: false,
      overridden: false,
    };
  }

  return {
    score: override.priorityScore,
    priority: override.priority,
    hidden: override.hidden === true,
    overridden: true,
  };
}

export function buildViewerOverride(
  priority: Priority,
  options?: { hidden?: boolean }
): ViewerPriorityOverride {
  return {
    priority,
    priorityScore: priorityToScore(priority),
    hidden: options?.hidden,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeViewerOverrideMetadata(
  metadata: unknown,
  userId: string,
  override: ViewerPriorityOverride | null
): Record<string, unknown> {
  const meta = { ...((metadata ?? {}) as Record<string, unknown>) };
  const viewerOverrides = {
    ...((meta.viewerOverrides as Record<string, ViewerPriorityOverride> | undefined) ??
      {}),
  };

  if (override) {
    viewerOverrides[userId] = override;
  } else {
    delete viewerOverrides[userId];
  }

  if (Object.keys(viewerOverrides).length > 0) {
    meta.viewerOverrides = viewerOverrides;
  } else {
    delete meta.viewerOverrides;
  }

  return meta;
}

export function effectivePriorityLabel(
  priority: Priority,
  overridden: boolean
): string {
  return overridden ? `${priority} (your setting)` : priority;
}
