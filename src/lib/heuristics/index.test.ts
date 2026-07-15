import { describe, it, expect } from "vitest";
import { analyzeCommunication } from "./index";

describe("analyzeCommunication", () => {
  it("scores explicit asks highly", () => {
    const result = analyzeCommunication({
      body: "Can you please review the proposal and send feedback by Friday?",
      receivedAt: new Date(),
    });

    expect(result.priorityScore).toBeGreaterThanOrEqual(6);
    expect(result.priorityReasons).toContain("Contains explicit ask");
    expect(result.tags).toContain("action-required");
  });

  it("penalizes noise patterns", () => {
    const result = analyzeCommunication({
      body: "FYI - the meeting has been moved to 3pm. No action needed.",
      receivedAt: new Date(),
    });

    expect(result.tags).toContain("noise");
    expect(result.priority).toBe("INFO");
  });

  it("boosts directed questions when the viewer is in Cc", () => {
    const result = analyzeCommunication({
      subject: "Partner follow-up",
      body: "When can we schedule the onsite visit?",
      receivedAt: new Date(),
      fromAddress: "jane@wwt.com",
      toAddresses: ["team@wwt.com"],
      ccAddresses: ["brian@example.com"],
      teamMembers: [
        { id: "u1", name: "Brian Sak", email: "brian@example.com" },
      ],
    });

    expect(result.tags).toContain("directed-question");
    expect(result.directedRecipientUserIds).toEqual(["u1"]);
    expect(result.priorityScore).toBeGreaterThanOrEqual(4);
    expect(result.suggestedAction).toContain("Answer");
  });

  it("boosts priority when viewer is @mentioned", () => {
    const result = analyzeCommunication({
      body: "@Brian Sak can you send the WWT security update?",
      receivedAt: new Date(),
      teamMembers: [
        { id: "u1", name: "Brian Sak", email: "brian@example.com" },
      ],
      viewer: { id: "u1", name: "Brian Sak", email: "brian@example.com" },
    });

    expect(result.tags).toContain("mentioned-you");
    expect(result.viewerMentioned).toBe(true);
    expect(result.priorityScore).toBeGreaterThanOrEqual(6);
    expect(result.suggestedAction).toBe("Respond — you were @mentioned");
  });

  it("handles empty body", () => {
    const result = analyzeCommunication({
      body: "",
      receivedAt: new Date(),
    });
    expect(result.priority).toBe("INFO");
    expect(result.summary).toBeDefined();
  });

  it("flags unanswered threads", () => {
    const result = analyzeCommunication({
      body: "Following up on our last conversation.",
      receivedAt: new Date(),
      daysSinceLastTeamReply: 5,
    });

    expect(result.tags).toContain("unanswered");
    expect(result.suggestedAction).toBe("Follow up on unanswered thread");
  });

  it("boosts priority for partner coverage email", () => {
    const result = analyzeCommunication({
      body: "Following up on the joint roadmap.",
      subject: "[WWT] Weekly sync",
      receivedAt: new Date(),
      fromAddress: "contact@wwt.com",
      partnerAllowlistRules: [
        { fromDomain: "wwt.com", fromAddress: null, subjectPrefix: "[WWT]" },
      ],
    });

    expect(result.priorityScore).toBeGreaterThanOrEqual(2);
    expect(result.tags).toContain("partner-coverage");
  });
});
