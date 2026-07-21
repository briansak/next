import { describe, expect, it } from "vitest";
import {
  buildHeuristicTechnologySpaceSummary,
  pickTechnologySpaceForOllamaSummary,
} from "./technology-summary";

describe("pickTechnologySpaceForOllamaSummary", () => {
  const spaces = [
    { id: "allow-1", spaceId: "space-a" },
    { id: "allow-2", spaceId: "space-b" },
  ];

  it("picks the space with the most messages by default", () => {
    const counts = new Map([
      ["space-a", 3],
      ["space-b", 12],
    ]);

    expect(pickTechnologySpaceForOllamaSummary(spaces, counts)).toBe("space-b");
  });

  it("respects OLLAMA_TECHNOLOGY_SPACE_ID when set", () => {
    const previous = process.env.OLLAMA_TECHNOLOGY_SPACE_ID;
    process.env.OLLAMA_TECHNOLOGY_SPACE_ID = "allow-1";

    const counts = new Map([
      ["space-a", 3],
      ["space-b", 12],
    ]);

    expect(pickTechnologySpaceForOllamaSummary(spaces, counts)).toBe("space-a");

    if (previous === undefined) {
      delete process.env.OLLAMA_TECHNOLOGY_SPACE_ID;
    } else {
      process.env.OLLAMA_TECHNOLOGY_SPACE_ID = previous;
    }
  });
});

describe("buildHeuristicTechnologySpaceSummary", () => {
  it("returns empty-state text when there are no messages", () => {
    const summary = buildHeuristicTechnologySpaceSummary(
      "Cisco Networking",
      "Networking",
      []
    );

    expect(summary.messageCount).toBe(0);
    expect(summary.text).toContain("No recent messages");
  });

  it("extracts questions and themes from recent messages", () => {
    const summary = buildHeuristicTechnologySpaceSummary(
      "Security GTM",
      "Security",
      [
        {
          id: "1",
          body: "Can we get support for the new firewall rollout next week?",
          authorName: "Alex",
          receivedAt: new Date("2026-07-14T10:00:00Z"),
        },
        {
          id: "2",
          body: "Customer asked about pricing for the security bundle.",
          authorName: "Jamie",
          receivedAt: new Date("2026-07-14T11:00:00Z"),
          mentionedUserIds: ["user-1"],
        },
      ]
    );

    expect(summary.messageCount).toBe(2);
    expect(summary.asks.length).toBeGreaterThan(0);
    expect(summary.themes).toContain("support");
    expect(summary.themes).toContain("pricing");
    expect(summary.text).toContain("Security GTM");
  });
});
