import { describe, expect, it } from "vitest";
import { calendarEventId, parseIcs } from "./ics";

describe("parseIcs", () => {
  it("parses a VEVENT with organizer and attendees", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-123@wwt.com
DTSTART:20260715T150000Z
DTEND:20260715T160000Z
SUMMARY:[WWT] Weekly sync
DESCRIPTION:Review PSA updates
LOCATION:Teams
ORGANIZER;CN=Jane Doe:mailto:jane@wwt.com
ATTENDEE;CN=Brian:mailto:brsak@cisco.com
END:VEVENT
END:VCALENDAR`;

    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("[WWT] Weekly sync");
    expect(events[0].organizerEmail).toBe("jane@wwt.com");
    expect(events[0].attendeeEmails).toContain("brsak@cisco.com");
    expect(events[0].start.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("marks events with RRULE as recurring", () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1
DTSTART:20260715T150000Z
SUMMARY:[WWT] Weekly sync
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`;

    const events = parseIcs(ics);
    expect(events[0].isRecurring).toBe(true);
  });

  it("generates stable calendar ids", () => {
    const start = new Date("2026-07-15T15:00:00Z");
    expect(calendarEventId("abc", start)).toHaveLength(40);
  });
});
