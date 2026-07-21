import { describe, expect, it } from "vitest";
import {
  collectCommitmentCandidates,
  inferCommitmentOwner,
  partnerAskToCommitment,
} from "./commitments";

describe("inferCommitmentOwner", () => {
  it("marks assigned meeting items as ME", () => {
    expect(
      inferCommitmentOwner("Send updated architecture diagram", {
        userId: "user-1",
        assigneeUserIds: ["user-1"],
      })
    ).toBe("ME");
  });

  it("detects partner language", () => {
    expect(
      inferCommitmentOwner("Partner will send the SOW by Friday")
    ).toBe("PARTNER");
  });
});

describe("collectCommitmentCandidates", () => {
  it("dedupes partner asks and meeting items", () => {
    const ask = partnerAskToCommitment({
      communicationId: "comm-1",
      subject: "Pricing",
      ask: "Can you confirm pricing for the POV?",
      source: "EMAIL",
      priority: "HIGH",
      receivedAt: new Date("2026-07-15T12:00:00Z"),
      authorName: "Alex",
    });

    const candidates = collectCommitmentCandidates({
      userId: "user-1",
      partnerAsks: [
        {
          communicationId: "comm-1",
          subject: "Pricing",
          ask: "Can you confirm pricing for the POV?",
          source: "EMAIL",
          priority: "HIGH",
          receivedAt: new Date("2026-07-15T12:00:00Z"),
          authorName: "Alex",
        },
      ],
      meetings: [
        {
          id: "comm-1",
          receivedAt: new Date("2026-07-14T12:00:00Z"),
          metadata: {
            summaryActionItems: ["Can you confirm pricing for the POV?"],
          },
        },
      ],
      nextSteps: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].owner).toBe("ME");
    expect(ask.owner).toBe("ME");
  });
});
