import { describe, expect, it } from "vitest";
import {
  applyUserNextStepOrder,
  formatNextStepHeadline,
  formatNextStepMeta,
} from "./next-step-display";

const baseCommunication = {
  subject: "AI Defense Oracle Cloud roadmap",
  source: "WEBEX",
  receivedAt: new Date("2026-07-13T10:00:00Z"),
  authorName: "Jamie",
  excerpt: null,
};

describe("formatNextStepHeadline", () => {
  it("adds thread context to generic @mention titles", () => {
    expect(
      formatNextStepHeadline({
        title: "Respond — you were @mentioned",
        status: "OPEN",
        dueAt: null,
        communication: baseCommunication,
      })
    ).toBe('Respond — @mentioned in “AI Defense Oracle Cloud roadmap”');
  });

  it("adds email subject to generic answer titles", () => {
    expect(
      formatNextStepHeadline({
        title: "Answer the question in this email",
        status: "OPEN",
        dueAt: null,
        communication: {
          ...baseCommunication,
          source: "EMAIL",
          subject: "Re: Q2 partner forecast",
        },
      })
    ).toBe('Answer: “Re: Q2 partner forecast”');
  });

  it("appends event subject to prep to-dos", () => {
    expect(
      formatNextStepHeadline({
        title: "Confirm attendee list",
        status: "OPEN",
        dueAt: null,
        communication: {
          ...baseCommunication,
          source: "OUTLOOK_CALENDAR",
          subject: "Acme QBR",
        },
      })
    ).toBe("Confirm attendee list · Acme QBR");
  });
});

describe("formatNextStepMeta", () => {
  it("includes source, author, and timing", () => {
    const meta = formatNextStepMeta({
      title: "Confirm attendee list",
      status: "IN_PROGRESS",
      dueAt: new Date("2026-07-20T15:00:00Z"),
      communication: baseCommunication,
    });

    expect(meta).toContain("IN PROGRESS");
    expect(meta).toContain("Webex message");
    expect(meta).toContain("from Jamie");
    expect(meta).toContain("Due");
  });
});

describe("applyUserNextStepOrder", () => {
  it("sorts steps by saved user order", () => {
    const steps = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(applyUserNextStepOrder(steps, ["c", "a", "b"])).toEqual([
      { id: "c" },
      { id: "a" },
      { id: "b" },
    ]);
  });
});
