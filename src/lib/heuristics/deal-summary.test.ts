import { describe, expect, it } from "vitest";
import { buildHeuristicDealSpaceSummary } from "./deal-summary";

describe("buildHeuristicDealSpaceSummary", () => {
  it("returns guidance when no messages exist", () => {
    const summary = buildHeuristicDealSpaceSummary("WWT Security POV", "WWT Security POV", []);

    expect(summary.text).toContain("No recent messages");
    expect(summary.label).toBe("WWT Security POV");
    expect(summary.messageCount).toBe(0);
  });

  it("extracts questions and follow-ups from recent messages", () => {
    const summary = buildHeuristicDealSpaceSummary("Deal room", "Customer POC", [
      {
        id: "1",
        body: "Can we confirm pricing before Friday?",
        authorName: "Alex",
        receivedAt: new Date("2026-07-14T12:00:00Z"),
      },
      {
        id: "2",
        body: "Next step: send the updated SOW to legal.",
        authorName: "Jordan",
        receivedAt: new Date("2026-07-13T12:00:00Z"),
      },
    ]);

    expect(summary.asks.length).toBeGreaterThan(0);
    expect(summary.nextSteps.length).toBeGreaterThan(0);
    expect(summary.text).toContain("Deal room");
  });
});
