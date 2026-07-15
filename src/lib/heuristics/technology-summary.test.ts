import { describe, expect, it } from "vitest";
import { buildHeuristicTechnologySpaceSummary } from "./technology-summary";

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
