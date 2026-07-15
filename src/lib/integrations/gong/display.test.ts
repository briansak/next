import { describe, expect, it } from "vitest";
import { formatGongSummaryForDisplay, gongSummaryHasStructuredContent } from "./display";

describe("formatGongSummaryForDisplay", () => {
  it("formats explicit bullet takeaways", () => {
    const result = formatGongSummaryForDisplay(`Summary:
Discussed Q3 pipeline and partner expansion.

- Brian to send follow-up deck by Friday
- Jane to schedule onsite visit next week
- Team aligned on EMEA rollout timing`);

    expect(result.overview).toContain("Q3 pipeline");
    expect(result.takeaways).toEqual([
      "Brian to send follow-up deck by Friday",
      "Jane to schedule onsite visit next week",
      "Team aligned on EMEA rollout timing",
    ]);
  });

  it("splits long prose into sentence takeaways", () => {
    const result = formatGongSummaryForDisplay(
      "The team reviewed Q3 pipeline health. Partner expansion in EMEA was highlighted as the top priority. Brian committed to sending the follow-up deck by Friday. Jane will schedule the onsite visit next week."
    );

    expect(result.overview).toContain("Q3 pipeline");
    expect(result.takeaways.length).toBeGreaterThanOrEqual(2);
  });

  it("returns a short summary as overview only", () => {
    const result = formatGongSummaryForDisplay("Quick sync on partner forecast.");
    expect(result.overview).toBe("Quick sync on partner forecast.");
    expect(result.takeaways).toEqual([]);
  });

  it("reports when structured content exists", () => {
    const display = formatGongSummaryForDisplay("Quick sync on partner forecast.");
    expect(gongSummaryHasStructuredContent(display)).toBe(true);
  });
});
