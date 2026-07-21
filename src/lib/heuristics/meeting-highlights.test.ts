import { describe, expect, it } from "vitest";
import {
  buildMeetingHighlights,
  estimateDurationFromSummaryInput,
} from "./meeting-highlights";

describe("meeting-highlights", () => {
  it("estimates duration from timestamped summary input", () => {
    const duration = estimateDurationFromSummaryInput(
      [
        "[00:00] Host: Kickoff.",
        "[00:15] Host: Demo starts.",
        "[00:30] Host: Wrap up.",
      ].join("\n")
    );

    expect(duration).toBe(30);
  });

  it("builds heuristic highlights without Ollama", async () => {
    const highlights = await buildMeetingHighlights({
      meetingTitle: "Weekly Sync",
      summaryInput: [
        "[00:00] Brian: Funding update for NFR.",
        "[00:10] Ken: Please review Mindtickle before next week.",
        "[00:20] Brian: ICE is moving to NFR next.",
      ].join("\n"),
      durationSeconds: 1200,
    });

    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0]?.description.length).toBeGreaterThan(10);
  });
});
