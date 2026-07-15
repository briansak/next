import { describe, it, expect } from "vitest";
import {
  matchesEmailAllowlist,
  scoreEmailPartnerPriority,
} from "./allowlist";

describe("scoreEmailPartnerPriority", () => {
  const rules = [
    { fromAddress: "partner@wwt.com", fromDomain: null, subjectPrefix: null },
    { fromAddress: null, fromDomain: "wwt.com", subjectPrefix: null },
    { fromAddress: null, fromDomain: null, subjectPrefix: "[WWT]" },
  ];

  it("returns no boost when no rules configured", () => {
    expect(
      scoreEmailPartnerPriority(
        { fromAddress: "anyone@example.com", subject: "Hello" },
        []
      )
    ).toEqual({ matched: false, scoreBoost: 0, reasons: [], tags: [] });
  });

  it("boosts WWT sender domain", () => {
    const result = scoreEmailPartnerPriority(
      { fromAddress: "contact@wwt.com", subject: "Project update" },
      rules
    );
    expect(result.matched).toBe(true);
    expect(result.scoreBoost).toBeGreaterThanOrEqual(2);
    expect(result.tags).toContain("partner-coverage");
  });

  it("boosts subject prefix", () => {
    const result = scoreEmailPartnerPriority(
      { fromAddress: "unknown@other.com", subject: "[WWT] Weekly sync" },
      rules
    );
    expect(result.matched).toBe(true);
    expect(result.scoreBoost).toBeGreaterThanOrEqual(2);
  });

  it("does not boost unrelated personal email", () => {
    expect(
      scoreEmailPartnerPriority(
        { fromAddress: "me@gmail.com", subject: "Personal note" },
        rules
      ).matched
    ).toBe(false);
  });
});

describe("matchesEmailAllowlist", () => {
  it("reflects partner priority match", () => {
    expect(
      matchesEmailAllowlist(
        { fromAddress: "contact@wwt.com", subject: "Project update" },
        [{ fromDomain: "wwt.com", fromAddress: null, subjectPrefix: null }]
      )
    ).toBe(true);
  });
});
