import { describe, expect, it } from "vitest";
import {
  buildClusterAssignments,
  classifyCalendarEventKind,
  clusterCalendarEvents,
  missingTravelNextStepTitle,
} from "./calendar-event-clustering";

function daysFromNow(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe("classifyCalendarEventKind", () => {
  it("detects conferences, flights, and hotels", () => {
    expect(
      classifyCalendarEventKind({
        id: "1",
        subject: "Black Hat USA 2026",
        location: "Las Vegas",
        start: daysFromNow(30),
      })
    ).toBe("conference");

    expect(
      classifyCalendarEventKind({
        id: "2",
        subject: "United flight to LAS",
        start: daysFromNow(29),
      })
    ).toBe("travel-flight");

    expect(
      classifyCalendarEventKind({
        id: "3",
        subject: "Marriott check-in",
        start: daysFromNow(29),
      })
    ).toBe("travel-hotel");
  });
});

describe("clusterCalendarEvents", () => {
  it("nests travel under Black Hat / DEF CON and flags missing travel", () => {
    const conferenceStart = daysFromNow(30);
    const conferenceEnd = new Date(conferenceStart);
    conferenceEnd.setDate(conferenceEnd.getDate() + 4);

    const groups = clusterCalendarEvents([
      {
        id: "conf",
        subject: "Black Hat / DEF CON",
        location: "Las Vegas",
        start: conferenceStart,
        end: conferenceEnd,
        isAllDay: true,
      },
      {
        id: "flight",
        subject: "United flight to LAS",
        start: daysFromNow(29, 8),
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.children.map((child) => child.id)).toEqual(["flight"]);
    expect(groups[0]?.missingTravel).toBe(true);
  });

  it("clears missing travel when flight and hotel are present", () => {
    const conferenceStart = daysFromNow(20);
    const groups = clusterCalendarEvents([
      {
        id: "conf",
        subject: "Cisco Live US 2026",
        location: "San Diego",
        start: conferenceStart,
        end: new Date(conferenceStart.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: "flight",
        subject: "Delta flight to SAN",
        start: daysFromNow(19),
      },
      {
        id: "hotel",
        subject: "Marriott check-out",
        start: daysFromNow(23),
      },
    ]);

    expect(groups[0]?.missingTravel).toBe(false);
  });
});

describe("buildClusterAssignments", () => {
  it("assigns parent and child metadata", () => {
    const assignments = buildClusterAssignments([
      {
        id: "conf",
        subject: "Black Hat USA",
        location: "Las Vegas",
        start: daysFromNow(25),
      },
      {
        id: "hotel",
        subject: "Marriott Las Vegas check-in",
        start: daysFromNow(24),
      },
    ]);

    expect(assignments.get("conf")?.eventKind).toBe("conference");
    expect(assignments.get("hotel")?.parentEventId).toBe("conf");
    expect(assignments.get("conf")?.linkedTravelIds).toContain("hotel");
  });
});

describe("missingTravelNextStepTitle", () => {
  it("builds a book-travel headline", () => {
    expect(missingTravelNextStepTitle("Black Hat / DEF CON")).toBe(
      "Book travel for Black Hat / DEF CON"
    );
  });
});
