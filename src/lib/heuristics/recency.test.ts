import { describe, it, expect } from "vitest";
import {
  ageDecayPenalty,
  computeDashboardScore,
  warrantsAction,
} from "./recency";

describe("ageDecayPenalty", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("applies no penalty for today", () => {
    expect(ageDecayPenalty(new Date("2026-07-14T08:00:00Z"), now)).toBe(0);
  });

  it("applies light penalty for yesterday", () => {
    expect(ageDecayPenalty(new Date("2026-07-13T12:00:00Z"), now)).toBe(1);
  });

  it("applies stronger penalty for week-old messages", () => {
    expect(ageDecayPenalty(new Date("2026-07-07T12:00:00Z"), now)).toBe(3);
  });

  it("caps penalty for messages older than a week", () => {
    expect(ageDecayPenalty(new Date("2026-06-01T12:00:00Z"), now)).toBe(5);
  });
});

describe("warrantsAction", () => {
  it("returns false for noise-only messages", () => {
    expect(warrantsAction(["noise"])).toBe(false);
  });

  it("returns true when action signals are present", () => {
    expect(warrantsAction(["action-required"])).toBe(true);
    expect(warrantsAction(["mentioned-you"])).toBe(true);
  });

  it("returns true for mentions even with noise tag", () => {
    expect(warrantsAction(["noise", "mentioned-you"])).toBe(true);
  });

  it("returns false for calendar holds and routine events", () => {
    expect(warrantsAction(["calendar", "calendar-hold"])).toBe(false);
    expect(warrantsAction(["calendar", "routine"])).toBe(false);
    expect(warrantsAction(["travel-logistics", "travel-flight"])).toBe(false);
  });
});

describe("computeDashboardScore", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("keeps fresh @mentions highly ranked", () => {
    const result = computeDashboardScore({
      baseScore: 8,
      receivedAt: new Date("2026-07-14T10:00:00Z"),
      tags: ["mentioned-you", "action-required"],
      mentionedYou: true,
      hasOpenNextStep: false,
      now,
    });

    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.deprioritized).toBe(false);
  });

  it("deprioritizes old messages even with a high base score", () => {
    const result = computeDashboardScore({
      baseScore: 8,
      receivedAt: new Date("2026-07-01T10:00:00Z"),
      tags: ["action-required"],
      mentionedYou: false,
      hasOpenNextStep: false,
      now,
    });

    expect(result.score).toBeLessThan(6);
    expect(result.adjustments.some((a) => a.includes("days old"))).toBe(true);
  });

  it("deprioritizes when an action item is already tracked", () => {
    const result = computeDashboardScore({
      baseScore: 7,
      receivedAt: new Date("2026-07-14T10:00:00Z"),
      tags: ["mentioned-you"],
      mentionedYou: true,
      hasOpenNextStep: true,
      now,
    });

    expect(result.adjustments).toContain("Action item already tracked");
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it("deprioritizes informational messages without action signals", () => {
    const result = computeDashboardScore({
      baseScore: 3,
      receivedAt: new Date("2026-07-14T10:00:00Z"),
      tags: ["noise"],
      mentionedYou: false,
      hasOpenNextStep: false,
      now,
    });

    expect(result.deprioritized).toBe(true);
    expect(result.adjustments).toContain("No clear action needed");
  });

  it("deprioritizes colleague PTO even with a high base score", () => {
    const result = computeDashboardScore({
      baseScore: 8,
      receivedAt: new Date("2026-07-20T10:00:00Z"),
      tags: ["calendar", "calendar-hold"],
      mentionedYou: false,
      hasOpenNextStep: false,
      now,
    });

    expect(result.deprioritized).toBe(true);
    expect(result.priority).toBe("INFO");
  });
});
