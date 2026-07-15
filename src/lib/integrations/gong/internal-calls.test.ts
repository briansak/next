import { describe, expect, it } from "vitest";
import { classifyInternalCall } from "./internal-calls";

describe("classifyInternalCall", () => {
  it("detects all hands calls", () => {
    expect(classifyInternalCall("WWT All Hands - July"))?.toEqual({
      type: "all-hands",
      label: "All hands",
    });
  });

  it("detects technology calls", () => {
    expect(classifyInternalCall("Networking Technology Call"))?.toEqual({
      type: "technology-call",
      label: "Technology call",
    });
  });

  it("detects enablement sessions", () => {
    expect(classifyInternalCall("Security Enablement Brown Bag"))?.toEqual({
      type: "enablement",
      label: "Enablement",
    });
  });

  it("returns null for partner meetings", () => {
    expect(classifyInternalCall("Acme partner strategy review")).toBeNull();
  });

  it("detects Bridge portfolio session replays from body context", () => {
    expect(
      classifyInternalCall(
        "If you give a bot some network bandwidth...",
        "If you give a bot some network bandwidth...",
        "The latest on our portfolio, all in one click. What's the story? In this session, Jeetu explores AI agents. Catch the replay on the Bridge."
      )
    )?.toEqual({
      type: "technology-call",
      label: "Technology call",
    });
  });
});
