import { describe, expect, it } from "vitest";
import {
  formatVidcastChapterSummary,
  mapVidcastHighlights,
  parseVidcastShareId,
} from "./vidcast-api";

describe("parseVidcastShareId", () => {
  it("extracts share id from replay links", () => {
    expect(
      parseVidcastShareId(
        "https://app.vidcast.io/share/f91d1f86-a05b-494f-bde1-80cbe120a973"
      )
    ).toBe("f91d1f86-a05b-494f-bde1-80cbe120a973");
  });
});

describe("formatVidcastChapterSummary", () => {
  it("formats chapter timestamps into bullets", () => {
    const summary = formatVidcastChapterSummary(
      "00:00 AI Era Cyber Defense\n05:20 Software Distribution Changes"
    );
    expect(summary).toContain("- AI Era Cyber Defense (00:00)");
    expect(summary).toContain("- Software Distribution Changes (05:20)");
  });
});

describe("mapVidcastHighlights", () => {
  it("maps Vidcast highlight items to card highlights", () => {
    const highlights = mapVidcastHighlights([
      {
        start_time_ms: 10559,
        end_time_ms: 28553,
        text: "AI Era Cyber Defense Focus 1",
      },
    ]);

    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.title).toBe("AI Era Cyber Defense Focus 1");
    expect(highlights[0]?.startSeconds).toBe(10);
    expect(highlights[0]?.timestamp).toBe("00:10");
  });
});

describe("flattenVidcastTranscript", () => {
  it("joins segment transcript text", async () => {
    const { flattenVidcastTranscript, enrichHighlightsFromTranscript } = await import(
      "./vidcast-api"
    );
    const text = flattenVidcastTranscript([
      { start_time_ms: 0, end_time_ms: 1000, transcript: "Hello team." },
      { start_time_ms: 1000, end_time_ms: 2000, transcript: "Welcome back." },
    ]);
    expect(text).toBe("Hello team. Welcome back.");
  });

  it("enriches highlight descriptions from transcript segments", async () => {
    const { enrichHighlightsFromTranscript } = await import("./vidcast-api");
    const highlights = enrichHighlightsFromTranscript(
      [
        {
          timestamp: "00:10",
          startSeconds: 10,
          title: "Topic",
          description: "Topic",
        },
      ],
      [
        {
          start_time_ms: 9000,
          end_time_ms: 15000,
          transcript: "We discussed partner enablement and the new playbook rollout.",
        },
      ]
    );
    expect(highlights[0]?.description).toContain("partner enablement");
  });
});
