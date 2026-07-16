import { describe, expect, it } from "vitest";
import {
  extractProductNameFromSubject,
  inferTechnologyLabel,
  isProductAnnouncementEmail,
  parseProductAnnouncementEmail,
  summarizeProductAnnouncement,
} from "./product-announcement";

const ISOVALENT_SUBJECT = "Introducing Isovalent Enterprise Platform 26.05";

const ISOVALENT_BODY = `
Isovalent Enterprise Platform 26.05 is now available with expanded runtime security and observability for cloud-native workloads.

What's new in this release:
- Enhanced Tetragon policy enforcement for Kubernetes and Linux hosts
- Deeper Hubble network flow visibility with improved filtering
- New integrations for Cisco Secure Cloud Analytics workflows
- Performance improvements for large-scale multi-cluster deployments

Learn more about the release and upgrade paths in the product documentation.
`.trim();

describe("isProductAnnouncementEmail", () => {
  it("detects Introducing product launch emails", () => {
    expect(
      isProductAnnouncementEmail(ISOVALENT_SUBJECT, ISOVALENT_BODY, "news@isovalent.io")
    ).toBe(true);
  });

  it("detects vendor New Release emails", () => {
    expect(
      isProductAnnouncementEmail(
        "New Release: LiveWire 26.1.2 and LiveNX 25.3.3",
        "BlueCat is pleased to announce the following releases with bug fixes and quality of life improvements for LiveWire and Omnipeek.",
        "product-notifications@bluecatnetworks.com"
      )
    ).toBe(true);
  });

  it("rejects webinar registration confirmations", () => {
    expect(
      isProductAnnouncementEmail(
        "You're Registered! Isovalent Summer School Session 3",
        "Your registration for this Webex webinar has been approved.",
        "webinars@webex.com"
      )
    ).toBe(false);
  });

  it("rejects personal account notifications", () => {
    expect(
      isProductAnnouncementEmail(
        "Your Statement Is Now Available",
        "Your account statement is now ready and available online.",
        "edelivery@etradefrommorganstanley.com"
      )
    ).toBe(false);
  });

  it("rejects training course availability emails", () => {
    expect(
      isProductAnnouncementEmail(
        "New Cisco Networking Platform Black Belt Presales Stage 2 Course Now Available for Technical Sellers",
        "The Platform GTM Team is thrilled to announce the launch of the Cisco Networking Platform Black Belt Pre-Sales Stage 2.",
        "sanshar4@cisco.com"
      )
    ).toBe(false);
  });
});

describe("parseProductAnnouncementEmail", () => {
  it("extracts Isovalent product metadata and summary bullets", () => {
    const parsed = parseProductAnnouncementEmail({
      messageId: "<isovalent-26.05@example.com>",
      subject: ISOVALENT_SUBJECT,
      body: ISOVALENT_BODY,
      fromAddress: "news@isovalent.io",
      fromName: "Isovalent",
      receivedAt: new Date("2026-07-10T12:00:00Z"),
      threadId: undefined,
      toAddresses: [],
      ccAddresses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.productName).toContain("Isovalent Enterprise Platform");
    expect(parsed!.productVersion).toBe("26.05");
    expect(parsed!.technologyLabel).toBe("Cloud Native Security");
    expect(parsed!.summary).toContain("Isovalent Enterprise Platform");
    expect(parsed!.summary).toContain("- ");
    expect(parsed!.summary).toMatch(/Tetragon/i);
  });
});

describe("extractProductNameFromSubject", () => {
  it("parses Introducing subject lines with version suffix", () => {
    const result = extractProductNameFromSubject(ISOVALENT_SUBJECT);
    expect(result.productName).toBe("Isovalent Enterprise Platform 26.05");
    expect(result.productVersion).toBe("26.05");
  });
});

describe("summarizeProductAnnouncement", () => {
  it("builds bullet summaries from feature lists", () => {
    const summary = summarizeProductAnnouncement(
      ISOVALENT_SUBJECT,
      ISOVALENT_BODY,
      "Isovalent Enterprise Platform 26.05"
    );

    expect(summary).toContain("\n- ");
    expect(summary).toMatch(/Hubble|Tetragon/i);
  });
});

describe("inferTechnologyLabel", () => {
  it("maps Isovalent to cloud native security", () => {
    expect(
      inferTechnologyLabel("Isovalent Enterprise Platform", ISOVALENT_SUBJECT, ISOVALENT_BODY)
    ).toBe("Cloud Native Security");
  });
});
