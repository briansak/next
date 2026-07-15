import { describe, expect, it } from "vitest";
import {
  isSkippedAppleCalendar,
  rawEventToCalendarEvent,
} from "./apple-calendar";

describe("rawEventToCalendarEvent", () => {
  it("maps exported EventKit fields into CalendarEvent", () => {
    const event = rawEventToCalendarEvent({
      calendar: "Calendar",
      uid: "abc-123",
      summary: "[WWT] Partner sync",
      start: "2026-07-15T14:00:00.000Z",
      end: "2026-07-15T15:00:00.000Z",
      location: "Teams",
      description: "Quarterly review",
      organizerEmail: "jane@wwt.com",
      organizerName: "Jane Doe",
      attendeeEmails: ["brsak@cisco.com"],
    });

    expect(event.summary).toBe("[WWT] Partner sync");
    expect(event.organizerEmail).toBe("jane@wwt.com");
    expect(event.attendeeEmails).toEqual(["brsak@cisco.com"]);
    expect(event.start.toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });
});

describe("isSkippedAppleCalendar", () => {
  it("skips built-in holiday and suggestion calendars", () => {
    expect(isSkippedAppleCalendar("Birthdays")).toBe(true);
    expect(isSkippedAppleCalendar("Calendar")).toBe(false);
  });
});
