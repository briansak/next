import { describe, expect, it } from "vitest";
import {
  isPartnerSenderAddress,
  normalizePartnerDomain,
  parsePartnerRuleInput,
  partnerCoverageFromRules,
  subjectMatchesPartnerPrefix,
} from "./partner-rules";

describe("partner rules", () => {
  it("normalizes domains and addresses", () => {
    expect(normalizePartnerDomain(" @Acme.COM ")).toBe("acme.com");
    expect(parsePartnerRuleInput({ kind: "address", value: "Jane@Acme.com" })).toEqual({
      kind: "address",
      value: "jane@acme.com",
    });
  });

  it("builds coverage config from allowlist rules", () => {
    expect(
      partnerCoverageFromRules([
        { fromDomain: "acme.com", fromAddress: null, subjectPrefix: null },
        { fromDomain: null, fromAddress: "lead@acme.com", subjectPrefix: null },
        { fromDomain: null, fromAddress: null, subjectPrefix: "[ACME]" },
      ])
    ).toEqual({
      domains: ["acme.com"],
      addresses: ["lead@acme.com"],
      subjectPrefixes: ["[ACME]"],
    });
  });

  it("matches partner senders and subject prefixes", () => {
    const coverage = {
      domains: ["acme.com"],
      addresses: ["vip@partner.io"],
      subjectPrefixes: ["[ACME]"],
    };

    expect(isPartnerSenderAddress("jane@acme.com", coverage)).toBe(true);
    expect(isPartnerSenderAddress("vip@partner.io", coverage)).toBe(true);
    expect(isPartnerSenderAddress("other@example.com", coverage)).toBe(false);
    expect(subjectMatchesPartnerPrefix("[ACME] Weekly sync", coverage)).toBe(true);
  });
});
