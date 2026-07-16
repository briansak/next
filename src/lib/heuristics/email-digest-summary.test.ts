import { describe, expect, it } from "vitest";
import {
  condenseLongSummary,
  distillEmailDigest,
  isDigestEmail,
} from "./email-digest-summary";

const SPLUNK_PARTNER_PULSE_BODY = `
Get ready for Splunk .conf26, September 14-16 in Denver â€“ three days of innovation, hands-on learning, cybersecurity insights, and unmatched networking with industry leaders and the Splunk community. Extend your experience with Splunk University (September 12-14) and take on the Boss of the SOC challenge (September 14). Register today or apply to be a sponsor through July 31! The nomination window for our Regional Partner Awards is open! Itâ€™s time to showcase your incredible impact and innovation within our partner community. Donâ€™t waitâ€”submit your nominations today and shine! Nominations due by June 30. Get the latest on Cisco and Splunk integration process, product innovations, and program updates. Join our leaders on June 11 at 8:00am PT for insights on what's new, what's next, and how partners can capitalize on emerging opportunities. Catch the biggest announcements from Cisco Live US 2026 in one fast-paced session on June 16 at 8:00am PT. Explore the latest innovations, solution updates, and key takeaways to help drive customer conversations and accelerate growth! Learn how to seamlessly ingest AWS data into Splunk to gain real-time visibility, improve troubleshooting, and unlock deeper insights. Join this session for practical guidance, best practices, and demos that help you get value from AWS data! The new Hidden Costs of Downtime campaign kit is now available for partners in Partner Marketing Center (PMC)! Access customizable, ready-to-launch assets designed to spark customer conversations around outages, resilience, operational risk, and business impact â€“ while driving engagement pipeline.
`.trim();

describe("distillEmailDigest", () => {
  it("detects Splunk Partner Pulse newsletters", () => {
    expect(isDigestEmail("Splunk Partner Pulse — June 2026", SPLUNK_PARTNER_PULSE_BODY)).toBe(
      true
    );
  });

  it("distills Partner Pulse into scannable bullets", () => {
    const summary = distillEmailDigest(
      "Splunk Partner Pulse — June 2026",
      SPLUNK_PARTNER_PULSE_BODY
    );

    expect(summary).not.toBeNull();
    expect(summary).toContain("Splunk Partner Pulse");
    expect(summary).toContain("- ");
    expect(summary).toMatch(/\.conf26/i);
    expect(summary).toMatch(/Regional Partner Awards/i);
    expect(summary).toMatch(/June 11/i);
    expect(summary).toMatch(/Cisco Live/i);
    expect(summary).toMatch(/AWS/i);
    expect(summary).toMatch(/Hidden Costs of Downtime/i);
    expect(summary!.length).toBeLessThan(SPLUNK_PARTNER_PULSE_BODY.length);
  });

  it("condenses an existing wall-of-text summary", () => {
    const condensed = condenseLongSummary(
      SPLUNK_PARTNER_PULSE_BODY,
      "Splunk Partner Pulse — June 2026"
    );

    expect(condensed).not.toBeNull();
    expect(condensed).toContain("\n- ");
  });
});
