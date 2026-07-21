import { describe, expect, it } from "vitest";
import {
  applyUserNextStepOrder,
  formatNextStepCardDisplay,
  formatNextStepHeadline,
  formatNextStepMeta,
  isGenericReviewNextStep,
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

describe("isGenericReviewNextStep", () => {
  it("detects review attachment to-dos", () => {
    expect(isGenericReviewNextStep("Review attached content or proposal")).toBe(true);
    expect(isGenericReviewNextStep("Confirm attendee list")).toBe(false);
  });
});

describe("formatNextStepCardDisplay", () => {
  it("replaces generic review titles with communication summary", () => {
    const card = formatNextStepCardDisplay(
      {
        title: "Review attached content or proposal",
        status: "OPEN",
        dueAt: null,
        communication: {
          ...baseCommunication,
          source: "EMAIL",
          subject: "Q2 PSA proposal deck",
          summary:
            "Q2 PSA proposal deck\n- Updated pricing for managed services\n- New security attach motion for federal accounts",
        },
      },
      { text: "AI overview of the PSA deck changes.", label: "AI summary", source: "ollama" }
    );

    expect(card.headline).toBe("Q2 PSA proposal deck");
    expect(card.summary?.text).toBe("AI overview of the PSA deck changes.");
    expect(card.summary?.label).toBe("AI summary");
    expect(card.meta).toContain("Email");
  });

  it("keeps actionable titles for non-review steps", () => {
    const card = formatNextStepCardDisplay({
      title: "Respond — you were @mentioned",
      status: "OPEN",
      dueAt: null,
      communication: baseCommunication,
    });

    expect(card.headline).toBe('Respond — @mentioned in “AI Defense Oracle Cloud roadmap”');
    expect(card.summary).toBeNull();
  });

  it("shows manual description as summary when there is no communication", () => {
    const card = formatNextStepCardDisplay({
      title: "CFP for Cisco Live 2026",
      status: "OPEN",
      dueAt: new Date("2026-08-04T17:00:00Z"),
      description:
        "Submit 400-word abstract and speaker bio. Due Aug 4, 2026.",
      communication: null,
    });

    expect(card.summary?.text).toContain("abstract");
    expect(card.summary?.source).toBe("manual");
    expect(card.meta).toContain("Manual");
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
