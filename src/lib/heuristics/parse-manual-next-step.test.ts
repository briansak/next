import { describe, expect, it } from "vitest";
import {
  extractDueDateFromText,
  parseManualNextStep,
} from "./parse-manual-next-step";

describe("extractDueDateFromText", () => {
  const now = new Date("2026-07-17T12:00:00Z");

  it("parses month-day due phrases", () => {
    const due = extractDueDateFromText(
      "CFP for Cisco Live due August 4th",
      now
    );
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(7);
    expect(due?.getDate()).toBe(4);
  });

  it("parses until month-day phrases", () => {
    const due = extractDueDateFromText(
      "Accepting Submissions until August 4, 2026 at midnight CEST",
      now
    );
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(7);
    expect(due?.getDate()).toBe(4);
  });

  it("parses numeric dates", () => {
    const due = extractDueDateFromText("Submit by 8/4/2026", now);
    expect(due?.getMonth()).toBe(7);
    expect(due?.getDate()).toBe(4);
  });

  it("rolls to next year when date already passed", () => {
    const due = extractDueDateFromText("Renew license by January 15", now);
    expect(due?.getFullYear()).toBe(2027);
    expect(due?.getMonth()).toBe(0);
    expect(due?.getDate()).toBe(15);
  });
});

describe("parseManualNextStep", () => {
  it("builds title, summary, priority, and due date from pasted details", () => {
    const parsed = parseManualNextStep(
      [
        "CFP for Cisco Live 2026 — Security track",
        "",
        "Need to submit a 400-word abstract and speaker bio.",
        "Submission portal closes August 4th.",
        "Please review the track guidelines and confirm topic fit.",
      ].join("\n"),
      { now: new Date("2026-07-17T12:00:00Z") }
    );

    expect(parsed.title.toLowerCase()).toContain("cfp");
    expect(parsed.summary.length).toBeGreaterThan(20);
    expect(parsed.dueAt?.getMonth()).toBe(7);
    expect(["HIGH", "CRITICAL", "MEDIUM"]).toContain(parsed.priority);
    expect(parsed.tags).toContain("manual");
  });
});
