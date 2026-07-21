import { describe, expect, it } from "vitest";
import {
  meetingHasRecording,
  meetingSourceBadges,
  resolveMeetingTranscriptText,
  resolveUnifiedMeetingSummary,
  type UnifiedMeetingMetadata,
} from "./unify-summary";

describe("resolveUnifiedMeetingSummary", () => {
  it("prefers Gong summary over transcript summary", () => {
    const meta: UnifiedMeetingMetadata = {
      gongSummaryText: "Gong recap of the call",
      summaryText: "Transcript summary",
      summarySource: "ollama",
    };

    expect(resolveUnifiedMeetingSummary(meta)).toEqual({
      text: "Gong recap of the call",
      source: "gong",
      label: "Gong AI",
    });
  });

  it("falls back to transcript summary when Gong is absent", () => {
    const meta: UnifiedMeetingMetadata = {
      summaryText: "Ollama summary",
      summarySource: "ollama",
    };

    expect(resolveUnifiedMeetingSummary(meta)).toEqual({
      text: "Ollama summary",
      source: "ollama",
      label: "AI summary",
    });
  });

  it("uses replay summary when no Gong or transcript summary exists", () => {
    const meta: UnifiedMeetingMetadata = {
      replaySummaryText: "Replay email summary",
    };

    expect(resolveUnifiedMeetingSummary(meta)).toEqual({
      text: "Replay email summary",
      source: "replay",
      label: "Replay summary",
    });
  });
});

describe("meetingSourceBadges", () => {
  it("shows transcript, Gong, and replay badges when all sources present", () => {
    const badges = meetingSourceBadges({
      transcriptText: "hello",
      gongSummaryText: "gong",
      replayUrl: "https://example.com/replay",
    });

    expect(badges.map((badge) => badge.kind)).toEqual([
      "webex-transcript",
      "gong",
      "replay-email",
    ]);
  });

  it("shows recording badge when only recording URLs exist", () => {
    const badges = meetingSourceBadges({
      recordingPlaybackUrl: "https://webex.example/recording",
    });

    expect(badges).toEqual([{ kind: "webex-recording", label: "Recording" }]);
  });

  it("shows Gong transcript badge on recording cards without Webex transcript", () => {
    const badges = meetingSourceBadges({
      gongTranscriptText: "Alice: discussed roadmap",
      recordingPlaybackUrl: "https://webex.example/recording",
    });

    expect(badges.map((badge) => badge.label)).toEqual([
      "Gong transcript",
      "Recording",
    ]);
  });
});

describe("resolveMeetingTranscriptText", () => {
  it("prefers Webex transcript over Gong transcript", () => {
    expect(
      resolveMeetingTranscriptText({
        transcriptText: "Webex transcript",
        gongTranscriptText: "Gong transcript",
        recordingPlaybackUrl: "https://example.com/recording",
      })
    ).toEqual({ text: "Webex transcript", source: "Webex" });
  });

  it("uses Gong transcript when Webex transcript is missing on recording cards", () => {
    expect(
      resolveMeetingTranscriptText({
        gongTranscriptText: "Alice: discussed roadmap",
        recordingPlaybackUrl: "https://example.com/recording",
      })
    ).toEqual({ text: "Alice: discussed roadmap", source: "Gong" });
  });

  it("ignores Gong transcript when no recording is linked", () => {
    expect(
      resolveMeetingTranscriptText({
        gongTranscriptText: "Alice: discussed roadmap",
      })
    ).toBeNull();
  });
});
