import { describe, expect, it } from "vitest";
import {
  extractMeetingTitleFromGongSubject,
  isGongEmail,
  normalizeMeetingTitle,
  parseGongEmail,
  titleSimilarity,
} from "./email";

describe("isGongEmail", () => {
  it("detects gong.io senders", () => {
    expect(isGongEmail("notifications@gong.io", "Call recap: WWT QBR")).toBe(true);
  });
});

describe("titleSimilarity", () => {
  it("matches equivalent meeting titles", () => {
    expect(
      titleSimilarity(
        "[WWT] Executive QBR onsite",
        "Executive QBR onsite"
      )
    ).toBeGreaterThan(0.9);
  });

  it("matches partial titles from Gong subjects", () => {
    expect(
      titleSimilarity(
        "WWT Partner sync",
        "[WWT] Partner sync - weekly"
      )
    ).toBeGreaterThan(0.55);
  });
});

describe("parseGongEmail", () => {
  it("extracts meeting title, summary, and action items", () => {
    const parsed = parseGongEmail({
      messageId: "gong-1",
      subject: "Recap: [WWT] Partner strategy review",
      fromAddress: "notifications@gong.io",
      receivedAt: new Date("2026-07-14T18:00:00Z"),
      body: `Summary:
Discussed Q3 pipeline and partner expansion.

Action items:
- Brian to send follow-up deck by Friday
- Jane to schedule onsite visit next week`,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.meetingTitle).toContain("Partner strategy");
    expect(parsed?.summary).toContain("Q3 pipeline");
    expect(parsed?.actionItems.length).toBeGreaterThanOrEqual(1);
    expect(parsed?.replayUrl).toBeNull();
  });
});

describe("extractGongReplayUrl", () => {
  it("extracts gong call replay links", async () => {
    const { extractGongReplayUrl } = await import("./email");
    expect(
      extractGongReplayUrl(
        "View call: https://app.gong.io/call?id=abc123&utm=1"
      )
    ).toBe("https://app.gong.io/call?id=abc123&utm=1");
  });
});

describe("extractMeetingTitleFromGongSubject", () => {
  it("strips recap prefixes", () => {
    expect(extractMeetingTitleFromGongSubject("Call recap: WWT QBR")).toBe(
      "WWT QBR"
    );
  });
});

describe("normalizeMeetingTitle", () => {
  it("removes WWT prefix and punctuation", () => {
    expect(normalizeMeetingTitle("[WWT] Partner Sync!")).toBe("partner sync");
  });
});
