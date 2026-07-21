import { describe, expect, it } from "vitest";
import { buildHeuristicTranscriptSummary } from "./transcript-summary";

describe("buildHeuristicTranscriptSummary", () => {
  it("builds an overview from substantive transcript sentences", () => {
    const summary = buildHeuristicTranscriptSummary(
      "Weekly Securions Team Meeting",
      [
        "Okay.",
        "Thanks everyone.",
        "Brian Sak: I wanted to give everybody a quick update on where we are with NFR.",
        "We got the secure networking SKUs moved over last month and partners are asking about timelines.",
        "Ken Daniels: Please review the Mindtickle flow before next week's base tour.",
      ].join(" ")
    );

    expect(summary.text).toContain("NFR");
    expect(summary.text).toContain("secure networking");
    expect(summary.themes).toContain("security");
    expect(summary.text.length).toBeGreaterThan(80);
  });

  it("includes extracted action language when team members are provided", () => {
    const summary = buildHeuristicTranscriptSummary(
      "PSA Sync",
      "Brian, can you send the updated PSA deck by Friday?",
      {
        teamMembers: [
          { id: "u1", name: "Brian Sak", email: "brsak@cisco.com" },
        ],
        viewerId: "u1",
      }
    );

    expect(summary.actionItems.length).toBeGreaterThan(0);
    expect(summary.text.toLowerCase()).toMatch(/follow-up|next step|psa deck/i);
  });
});
