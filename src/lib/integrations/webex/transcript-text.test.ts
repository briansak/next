import { describe, expect, it } from "vitest";
import { parseTranscriptContent, truncateForSummary } from "./transcript-text";

describe("parseTranscriptContent", () => {
  it("parses WebVTT cues into plain text", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Hello team.

2
00:00:04.000 --> 00:00:06.000
Let's review the PSA update.`;

    expect(parseTranscriptContent(vtt)).toBe(
      "Hello team. Let's review the PSA update."
    );
  });

  it("normalizes plain text", () => {
    expect(parseTranscriptContent("  Line one\n\nLine   two  ")).toBe(
      "Line one Line two"
    );
  });
});

describe("truncateForSummary", () => {
  it("truncates long transcripts", () => {
    const long = "a".repeat(20_000);
    const result = truncateForSummary(long, 100);
    expect(result.length).toBe(101);
    expect(result.endsWith("…")).toBe(true);
  });
});
