import { describe, expect, it } from "vitest";
import { isInternalCallCommunication, viewerAttendedInternalCall } from "./internal-call";

describe("isInternalCallCommunication", () => {
  it("detects tagged internal call emails", () => {
    expect(
      isInternalCallCommunication("EMAIL", "All Hands July", ["internal-call"], {
        internalCallType: "all-hands",
      })
    ).toBe(true);
  });

  it("detects gong meetings by title", () => {
    expect(
      isInternalCallCommunication(
        "WEBEX_MEETING",
        "Security Technology Call",
        ["gong-summary"],
        { gongSummaryText: "Discussed roadmap." }
      )
    ).toBe(true);
  });

  it("ignores partner meetings", () => {
    expect(
      isInternalCallCommunication(
        "WEBEX_MEETING",
        "Acme partner sync",
        ["gong-summary"],
        { gongSummaryText: "Discussed forecast." }
      )
    ).toBe(false);
  });
});

describe("viewerAttendedInternalCall", () => {
  it("returns true when viewer email is in participants", () => {
    expect(
      viewerAttendedInternalCall(
        { participantEmails: ["alex@example.com", "brsak@cisco.com"] },
        "brsak@cisco.com"
      )
    ).toBe(true);
  });

  it("returns null when participant data is unavailable", () => {
    expect(viewerAttendedInternalCall({}, "brsak@cisco.com")).toBeNull();
  });
});
