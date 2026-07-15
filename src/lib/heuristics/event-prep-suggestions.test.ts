import { describe, expect, it } from "vitest";
import {
  defaultPrepDueDate,
  suggestEventPrepTodos,
} from "./event-prep-suggestions";

describe("suggestEventPrepTodos", () => {
  it("suggests presentation prep for presenting events", () => {
    const suggestions = suggestEventPrepTodos({
      subject: "[WWT] Executive QBR — Brian presenting",
      tags: ["needs-prep", "partner-meeting"],
    });

    expect(suggestions.some((s) => /presentation content/i.test(s))).toBe(true);
  });

  it("suggests travel for onsite events", () => {
    const suggestions = suggestEventPrepTodos({
      subject: "WWT onsite strategy review",
      location: "St. Louis, MO",
      tags: ["plan-ahead"],
    });

    expect(suggestions.some((s) => /travel/i.test(s))).toBe(true);
  });
});

describe("defaultPrepDueDate", () => {
  it("defaults to two days before the event", () => {
    const eventStart = new Date("2026-07-20T15:00:00Z");
    const due = defaultPrepDueDate(eventStart);
    expect(due.getDate()).toBe(18);
  });
});
