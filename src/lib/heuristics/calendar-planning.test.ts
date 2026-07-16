import { describe, expect, it } from "vitest";
import {
  analyzeCalendarEvent,
  daysUntilEvent,
  isRoutineCalendarTitle,
} from "./calendar-planning";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(14, 0, 0, 0);
  return d;
}

describe("analyzeCalendarEvent", () => {
  it("boosts a future one-off partner workshop needing coordination", () => {
    const start = daysFromNow(10);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const result = analyzeCalendarEvent({
      summary: "[WWT] Executive QBR onsite",
      description: "Prepare deck and coordinate logistics",
      location: "St. Louis",
      start,
      end,
      attendeeEmails: ["jane@wwt.com", "brsak@cisco.com", "bob@wwt.com"],
      organizerEmail: "jane@wwt.com",
      isRecurring: false,
    });

    expect(result.needsPlanning).toBe(true);
    expect(result.tags).toContain("plan-ahead");
    expect(result.tags).toContain("one-off");
    expect(result.tags).toContain("coordination");
    expect(result.tags).toContain("big-rock");
    expect(result.priorityScore).toBeGreaterThanOrEqual(6);
    expect(result.suggestedAction).toMatch(/Coordinate with/i);
  });

  it("skips recurring series for proactive planning", () => {
    const result = analyzeCalendarEvent({
      summary: "[WWT] Weekly sync",
      start: daysFromNow(5),
      attendeeEmails: ["jane@wwt.com"],
      isRecurring: true,
    });

    expect(result.needsPlanning).toBe(false);
    expect(result.tags).toContain("recurring");
    expect(result.priorityScore).toBeLessThanOrEqual(2);
  });

  it("skips routine standups even when one-off", () => {
    const result = analyzeCalendarEvent({
      summary: "Daily stand-up",
      start: daysFromNow(3),
      attendeeEmails: ["a@cisco.com", "b@cisco.com"],
      isRecurring: false,
    });

    expect(result.needsPlanning).toBe(false);
    expect(result.tags).toContain("routine");
  });

  it("deprioritizes PTO and calendar holds", () => {
    const result = analyzeCalendarEvent({
      summary: "Geis PTO",
      start: daysFromNow(4),
      attendeeEmails: ["geis@cisco.com"],
      isRecurring: false,
    });

    expect(result.needsPlanning).toBe(false);
    expect(result.tags).toContain("calendar-hold");
    expect(result.priorityScore).toBeLessThanOrEqual(1);
    expect(result.priority).toBe("INFO");
  });

  it("ignores events far in the future", () => {
    const result = analyzeCalendarEvent({
      summary: "[WWT] Annual planning",
      start: daysFromNow(60),
      attendeeEmails: ["jane@wwt.com"],
      isRecurring: false,
    });

    expect(result.needsPlanning).toBe(false);
  });
});

describe("isRoutineCalendarTitle", () => {
  it("detects standups and 1:1s", () => {
    expect(isRoutineCalendarTitle("Team stand-up")).toBe(true);
    expect(isRoutineCalendarTitle("1:1 with Jane")).toBe(true);
    expect(isRoutineCalendarTitle("[WWT] Executive review")).toBe(false);
  });
});

describe("daysUntilEvent", () => {
  it("counts whole days until start", () => {
    const start = daysFromNow(5);
    expect(daysUntilEvent(start)).toBe(5);
  });
});
