import { describe, expect, it } from "vitest";
import {
  analyzeEmailAudience,
  applyViewerDirectedQuestionBoost,
  detectQuestions,
  isMailerEmail,
  viewerInRecipients,
} from "./email-questions";
import { parseAddressList } from "../integrations/email/recipients";

describe("parseAddressList", () => {
  it("parses mixed To header formats", () => {
    expect(
      parseAddressList(
        'Brian Sak <brsak@cisco.com>, Jane Doe <jane@wwt.com>, alerts@lists.example.com'
      )
    ).toEqual(["brsak@cisco.com", "jane@wwt.com", "alerts@lists.example.com"]);
  });
});

describe("detectQuestions", () => {
  it("finds explicit questions and ignores quoted replies", () => {
    const result = detectQuestions(
      "Quick follow-up.\n> Old thread content?\nCan you send the updated deck by Friday?"
    );

    expect(result.hasQuestion).toBe(true);
    expect(result.snippets.join(" ")).toContain("updated deck");
  });

  it("detects soft partner requests without a question mark", () => {
    const result = detectQuestions(
      "I was wondering if you had anything you could share yet on that viewpoint."
    );
    expect(result.hasQuestion).toBe(true);
    expect(result.snippets.join(" ")).toMatch(/wondering if you/i);
  });

  it("ignores URLs that contain question marks", () => {
    const result = detectQuestions(
      "See https://example.com/path?foo=bar for details."
    );
    expect(result.hasQuestion).toBe(false);
  });

  it("ignores email signature help lines", () => {
    const result = detectQuestions(
      "Calendar update.\n\nNeed help?\nDrew Kaiser\nWWT"
    );
    expect(result.hasQuestion).toBe(false);
  });

  it("ignores event registration subjects with trailing Questions?", () => {
    const result = detectQuestions(
      "You're registered for a WWT event: Cisco CTF - Neuro Nemesis - July 29 Questions?"
    );
    expect(result.hasQuestion).toBe(false);
  });
});

describe("isMailerEmail", () => {
  it("flags list and noreply mail", () => {
    expect(
      isMailerEmail({
        fromAddress: "notifications@gong.io",
        listId: "<partner-updates.example.com>",
      })
    ).toBe(true);

    expect(
      isMailerEmail({
        fromAddress: "no-reply@wwt.com",
      })
    ).toBe(true);
  });

  it("does not flag direct partner email", () => {
    expect(
      isMailerEmail({
        fromAddress: "jane@wwt.com",
        toAddresses: ["brsak@cisco.com"],
      })
    ).toBe(false);
  });
});

describe("analyzeEmailAudience", () => {
  it("bubbles questions when the viewer is in Cc", () => {
    const result = analyzeEmailAudience({
      subject: "Partner sync follow-up",
      body: "When can we schedule the onsite visit?",
      fromAddress: "jane@wwt.com",
      toAddresses: ["team@wwt.com"],
      ccAddresses: ["brsak@cisco.com"],
      teamMembers: [
        { id: "u1", name: "Brian Sak", email: "brsak@cisco.com" },
      ],
    });

    expect(result.tags).toContain("directed-question");
    expect(result.directedRecipientUserIds).toEqual(["u1"]);
    expect(result.scoreBoost).toBeGreaterThanOrEqual(3);
    expect(result.suggestedAction).toContain("Answer");
  });

  it("skips mailer blasts even when they contain questions", () => {
    const result = analyzeEmailAudience({
      subject: "Weekly newsletter",
      body: "What did you think of this week's updates? Unsubscribe here.",
      fromAddress: "newsletter@wwt.com",
      toAddresses: Array.from({ length: 10 }, (_, i) => `user${i}@example.com`),
      listUnsubscribe: "<mailto:unsub@wwt.com>",
      teamMembers: [
        { id: "u1", name: "Brian Sak", email: "brsak@cisco.com" },
      ],
    });

    expect(result.hasQuestion).toBe(true);
    expect(result.tags).not.toContain("directed-question");
    expect(result.isMailer).toBe(true);
  });
});

describe("applyViewerDirectedQuestionBoost", () => {
  it("boosts score for the signed-in recipient", () => {
    const boosted = applyViewerDirectedQuestionBoost(
      4,
      {
        hasQuestion: true,
        isMailer: false,
        toAddresses: ["brsak@cisco.com"],
      },
      { userId: "u1", email: "brsak@cisco.com" }
    );

    expect(boosted.directedQuestion).toBe(true);
    expect(boosted.score).toBeGreaterThan(4);
  });
});

describe("viewerInRecipients", () => {
  it("matches case-insensitively across To and Cc", () => {
    expect(
      viewerInRecipients("BRSak@Cisco.com", [], ["brsak@cisco.com"])
    ).toBe(true);
  });
});
