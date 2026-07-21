import { describe, expect, it } from "vitest";
import type { Priority } from "@prisma/client";
import {
  rankNextStepsForViewer,
  scoreNextStepForViewer,
} from "./next-step-ranking";

function step(
  overrides: Partial<{
    id: string;
    assigneeId: string | null;
    createdById: string | null;
    communicationId: string | null;
    priority: Priority;
    dueAt: Date | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? "step-1",
    assigneeId: overrides.assigneeId ?? null,
    createdById: overrides.createdById ?? null,
    communicationId: overrides.communicationId ?? "comm-1",
    priority: overrides.priority ?? "MEDIUM",
    dueAt: overrides.dueAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-07-01T12:00:00Z"),
  };
}

describe("scoreNextStepForViewer", () => {
  const viewerId = "viewer-1";
  const now = new Date("2026-07-17T12:00:00Z");

  it("ranks manual assigned steps with due dates above generic unassigned ingest steps", () => {
    const manual = step({
      id: "manual",
      assigneeId: viewerId,
      createdById: viewerId,
      communicationId: null,
      dueAt: new Date("2026-08-04T17:00:00Z"),
      priority: "MEDIUM",
    });
    const generic = step({
      id: "generic",
      assigneeId: null,
      communicationId: "comm-1",
      priority: "HIGH",
    });

    expect(scoreNextStepForViewer(manual, viewerId, now)).toBeGreaterThan(
      scoreNextStepForViewer(generic, viewerId, now)
    );
  });
});

describe("rankNextStepsForViewer", () => {
  const viewerId = "viewer-1";
  const now = new Date("2026-07-17T12:00:00Z");

  it("surfaces a due manual step ahead of stale generic steps", () => {
    const ranked = rankNextStepsForViewer(
      [
        step({ id: "generic", assigneeId: null, priority: "HIGH" }),
        step({
          id: "manual",
          assigneeId: viewerId,
          createdById: viewerId,
          communicationId: null,
          dueAt: new Date("2026-08-04T17:00:00Z"),
        }),
      ],
      viewerId,
      null,
      now
    );

    expect(ranked[0]?.id).toBe("manual");
  });

  it("honors saved user order after ranking", () => {
    const ranked = rankNextStepsForViewer(
      [
        step({ id: "a", assigneeId: viewerId, dueAt: new Date("2026-08-01T12:00:00Z") }),
        step({ id: "b", assigneeId: viewerId, dueAt: new Date("2026-07-20T12:00:00Z") }),
      ],
      viewerId,
      ["b", "a"],
      now
    );

    expect(ranked.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
