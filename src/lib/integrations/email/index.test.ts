import { describe, it, expect } from "vitest";
import { matchesEmailAllowlist } from "./allowlist";

describe("matchesEmailAllowlist", () => {
  const rules = [
    { fromAddress: "partner@wwt.com", fromDomain: null, subjectPrefix: null },
    { fromAddress: null, fromDomain: "wwt.com", subjectPrefix: null },
    { fromAddress: null, fromDomain: null, subjectPrefix: "[WWT]" },
  ];

  it("rejects when no rules configured", () => {
    expect(
      matchesEmailAllowlist(
        { fromAddress: "anyone@example.com", subject: "Hello" },
        []
      )
    ).toBe(false);
  });

  it("matches WWT sender domain", () => {
    expect(
      matchesEmailAllowlist(
        { fromAddress: "contact@wwt.com", subject: "Project update" },
        rules
      )
    ).toBe(true);
  });

  it("matches subject prefix", () => {
    expect(
      matchesEmailAllowlist(
        { fromAddress: "unknown@other.com", subject: "[WWT] Weekly sync" },
        rules
      )
    ).toBe(true);
  });

  it("rejects non-matching personal email", () => {
    expect(
      matchesEmailAllowlist(
        { fromAddress: "me@gmail.com", subject: "Personal note" },
        rules
      )
    ).toBe(false);
  });
});
