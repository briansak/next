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

export function parseDashboardHiddenCommunicationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function addDashboardHiddenCommunicationId(
  ids: string[],
  communicationId: string
): string[] {
  if (ids.includes(communicationId)) return ids;
  return [...ids, communicationId];
}

export function removeDashboardHiddenCommunicationId(
  ids: string[],
  communicationId: string
): string[] {
  return ids.filter((id) => id !== communicationId);
}

export function getViewerOverride(
  metadata: unknown,
  userId: string
): ViewerPriorityOverride | null {
  const meta = (metadata ?? {}) as CommunicationMetadataWithOverrides;
  return meta.viewerOverrides?.[userId] ?? null;
}

export function isCommunicationHiddenFromDashboard(
  metadata: unknown,
  userId: string,
  communicationId: string,
  hiddenCommunicationIds?: string[] | null
): boolean {
  if (hiddenCommunicationIds?.includes(communicationId)) return true;
  return getViewerOverride(metadata, userId)?.hidden === true;
}

export function mergeCommunicationMetadata(
  existingMetadata: unknown,
  incomingMetadata: Record<string, unknown>
): Record<string, unknown> {
  const existing = (existingMetadata ?? {}) as CommunicationMetadataWithOverrides;
  const merged = { ...incomingMetadata };

  if (
    existing.viewerOverrides &&
    Object.keys(existing.viewerOverrides).length > 0
  ) {
    merged.viewerOverrides = existing.viewerOverrides;
  }

  return merged;
}

export function applyViewerPriorityOverride(
  baseScore: number,
  basePriority: Priority,
  metadata: unknown,
  userId: string,
  options?: {
    communicationId?: string;
    hiddenCommunicationIds?: string[] | null;
  }
): {
  score: number;
  priority: Priority;
  hidden: boolean;
  overridden: boolean;
} {
  const override = getViewerOverride(metadata, userId);
  const hiddenByPreference =
    options?.communicationId &&
    options.hiddenCommunicationIds?.includes(options.communicationId);

  if (hiddenByPreference) {
    return {
      score: override?.priorityScore ?? PRIORITY_SCORES.INFO,
      priority: override?.priority ?? "INFO",
      hidden: true,
      overridden: true,
    };
  }

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
