import { describe, expect, it } from "vitest";
import {
  collectPartnerAsks,
  extractPartnerAskText,
  hasPartnerAskActionSignal,
  isPartnerAskCandidate,
} from "./partner-asks";

describe("partner asks", () => {
  it("extracts an explicit ask from email body", () => {
    const ask = extractPartnerAskText({
      id: "c1",
      subject: "WWT deck request",
      body: "Hi Brian, can you send the updated PSA deck by Friday?",
      excerpt: null,
      summary: null,
      source: "EMAIL",
      priority: "HIGH",
      receivedAt: new Date(),
      authorName: "Partner Rep",
      tags: [],
      metadata: {},
    });

    expect(ask).toMatch(/send the updated PSA deck/i);
  });

  it("collects partner coverage asks with action-required tag", () => {
    const asks = collectPartnerAsks([
      {
        id: "c1",
        subject: "WWT follow-up",
        body: "Could you confirm the NFR timeline for WWT?",
        excerpt: null,
        summary: null,
        source: "WEBEX",
        priority: "HIGH",
        receivedAt: new Date("2026-07-10"),
        authorName: "Partner Rep",
        tags: ["action-required", "partner-coverage"],
        metadata: {},
      },
      {
        id: "c2",
        subject: "FYI newsletter",
        body: "Newsletter content only.",
        excerpt: null,
        summary: null,
        source: "EMAIL",
        priority: "INFO",
        receivedAt: new Date("2026-07-09"),
        authorName: null,
        tags: ["noise"],
        metadata: {},
      },
    ]);

    expect(asks).toHaveLength(1);
    expect(asks[0]?.subject).toBe("WWT follow-up");
  });

  it("uses configured partner domains when partner-coverage tag is missing", () => {
    const coverage = {
      domains: ["wwt.com"],
      addresses: [],
      subjectPrefixes: ["[WWT]"],
    };
    const candidate = {
      id: "c1",
      subject: "Customer briefing availability",
      body: "Brian, what availability do you have next week?",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "MEDIUM" as const,
      receivedAt: new Date("2026-07-14"),
      authorName: "Jane Doe",
      tags: ["has-question", "directed-question", "email"],
      metadata: {
        fromAddress: "jane@wwt.com",
        questionSnippets: ["what availability do you have next week?"],
      },
    };

    expect(isPartnerAskCandidate(candidate, coverage)).toBe(true);
    expect(collectPartnerAsks([candidate], { partnerCoverage: coverage })).toHaveLength(1);
  });

  it("accepts directed partner email questions without explicit can-you phrasing", () => {
    const candidate = {
      id: "c1",
      subject: "Customer briefing availability",
      body: "Brian, what availability do you have next week for a WWT customer session?",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "MEDIUM" as const,
      receivedAt: new Date("2026-07-14"),
      authorName: "Mark Woodbury",
      tags: ["has-question", "directed-question", "partner-coverage", "email"],
      metadata: {
        fromAddress: "Mark.Woodbury@wwt.com",
        questionSnippets: [
          "what availability do you have next week for a WWT customer session?",
        ],
      },
    };

    expect(hasPartnerAskActionSignal(candidate)).toBe(true);
    expect(isPartnerAskCandidate(candidate)).toBe(true);
    expect(collectPartnerAsks([candidate])).toHaveLength(1);
  });

  it("accepts Mark Woodbury-style sovereign AI follow-up", () => {
    const body = [
      "Hi Brian,",
      "",
      "At the WWT/Cisco AI day we briefly discussed how well the security suite",
      "mapped for Sovereign/Air-gapped solutions.",
      "I was wondering if you had anything you could share yet on that viewpoint.",
      "",
      "Thanks in advance.",
      "Mark",
    ].join("\n");

    const candidate = {
      id: "woodbury",
      subject: "WWT/Cisco AI day security suite",
      body,
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "MEDIUM" as const,
      receivedAt: new Date("2026-07-15"),
      authorName: "Mark Woodbury",
      tags: [
        "action-required",
        "has-question",
        "directed-question",
        "partner-coverage",
        "email",
      ],
      metadata: {
        fromAddress: "Mark.Woodbury@wwt.com",
        questionSnippets: [
          "I was wondering if you had anything you could share yet on that viewpoint.",
        ],
      },
    };

    expect(isPartnerAskCandidate(candidate)).toBe(true);
    expect(collectPartnerAsks([candidate])).toHaveLength(1);
  });

  it("ignores meeting transcripts for partner ask panel", () => {
    expect(
      isPartnerAskCandidate({
        id: "m1",
        subject: "Weekly call",
        body: "Can you review the deck?",
        excerpt: null,
        summary: null,
        source: "WEBEX_MEETING",
        priority: "MEDIUM",
        receivedAt: new Date(),
        authorName: null,
        tags: ["action-required", "partner-coverage"],
        metadata: {},
      })
    ).toBe(false);
  });

  it("ignores signature Need help? lines from partner calendar emails", () => {
    const candidate = {
      id: "cal-1",
      subject: "Canceled: Brian and Drew Weekly Sync",
      body: "This meeting was canceled.\n\nNeed help?\nDrew Kaiser",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "MEDIUM" as const,
      receivedAt: new Date("2026-07-20"),
      authorName: "Kaiser, Drew",
      tags: ["has-question", "directed-question", "partner-coverage", "email"],
      metadata: {
        fromAddress: "drew.kaiser@wwt.com",
        questionSnippets: ["Need help?"],
      },
    };

    expect(isPartnerAskCandidate(candidate)).toBe(false);
    expect(collectPartnerAsks([candidate])).toHaveLength(0);
  });

  it("respects hide-from-dashboard viewer override", () => {
    const candidate = {
      id: "hidden-1",
      subject: "WWT follow-up",
      body: "Can you send the updated deck by Friday?",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "HIGH" as const,
      receivedAt: new Date("2026-07-20"),
      authorName: "Partner Rep",
      tags: ["action-required", "partner-coverage", "has-question", "directed-question"],
      metadata: {
        fromAddress: "jane@wwt.com",
        viewerOverrides: {
          "user-1": {
            priority: "INFO",
            priorityScore: 1,
            hidden: true,
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
        },
      },
    };

    expect(collectPartnerAsks([candidate])).toHaveLength(1);
    expect(collectPartnerAsks([candidate], { userId: "user-1" })).toHaveLength(0);
  });

  it("respects persisted dashboard hidden communication ids", () => {
    const candidate = {
      id: "hidden-2",
      subject: "WWT follow-up",
      body: "Can you send the updated deck by Friday?",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "HIGH" as const,
      receivedAt: new Date("2026-07-20"),
      authorName: "Partner Rep",
      tags: ["action-required", "partner-coverage", "has-question", "directed-question"],
      metadata: {
        fromAddress: "jane@wwt.com",
      },
    };

    expect(
      collectPartnerAsks([candidate], {
        userId: "user-1",
        hiddenCommunicationIds: ["hidden-2"],
      })
    ).toHaveLength(0);
  });

  it("ignores WWT event registration emails with trailing Questions?", () => {
    const candidate = {
      id: "event-reg-1",
      subject: "You're registered for a WWT event: Cisco CTF - Neuro Nemesis - July 29",
      body: "Thanks for registering.\n\nQuestions?\nWWT Events",
      excerpt: null,
      summary: null,
      source: "EMAIL" as const,
      priority: "MEDIUM" as const,
      receivedAt: new Date("2026-07-20"),
      authorName: "WWT Events",
      tags: ["has-question", "directed-question", "partner-coverage", "email"],
      metadata: {
        fromAddress: "events@wwt.com",
        questionSnippets: [
          "You're registered for a WWT event: Cisco CTF - Neuro Nemesis - July 29 Questions?",
        ],
      },
    };

    expect(isPartnerAskCandidate(candidate)).toBe(false);
    expect(collectPartnerAsks([candidate])).toHaveLength(0);
  });
});
