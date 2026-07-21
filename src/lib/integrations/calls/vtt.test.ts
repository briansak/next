import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  parseWebVtt,
  sampleTranscriptForSummary,
  transcriptDurationSeconds,
} from "./vtt";

const SAMPLE = `WEBVTT

1 "Alice" (1)
00:00:01.000 --> 00:00:04.000
Hello team.

2 "Bob" (2)
00:00:04.000 --> 00:00:08.500
We are changing the program scope.
`;

describe("parseWebVtt", () => {
  it("parses cues with speakers and timestamps", () => {
    const cues = parseWebVtt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.speaker).toBe("Alice");
    expect(cues[0]?.startSeconds).toBe(1);
    expect(cues[1]?.text).toContain("program scope");
  });

  it("formats timestamps and duration", () => {
    const cues = parseWebVtt(SAMPLE);
    expect(formatTimestamp(125)).toBe("02:05");
    expect(transcriptDurationSeconds(cues)).toBe(8.5);
    expect(sampleTranscriptForSummary(cues)).toContain("Alice:");
  });
});
