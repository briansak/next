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

  it("strips Webex speaker metadata from VTT", () => {
    const vtt = `WEBVTT

1
1 "Brian Sak" (1984217600)
00:00:01.000 --> 00:00:05.000
Up and down, so we'll see how well this works out.

2
2 "Ken Daniels" (1234567890)
00:00:06.000 --> 00:00:10.000
We got the secure networking SKUs moved over last month.`;

    expect(parseTranscriptContent(vtt)).toBe(
      "Up and down, so we'll see how well this works out. We got the secure networking SKUs moved over last month."
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
