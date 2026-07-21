import { describe, expect, it } from "vitest";
import { formatVidcastTranscriptSummary } from "./ollama";

describe("formatVidcastTranscriptSummary", () => {
  it("combines overview and takeaway bullets", () => {
    const text = formatVidcastTranscriptSummary({
      overview:
        "The town hall focused on AI-era cyber defense and partner enablement. Leaders outlined new resources and a faster software delivery cadence.",
      takeaways: [
        "Cisco published a customer playbook and self-assessment tool for AI security.",
        "Software distribution is moving to a monthly cadence.",
      ],
      actionItems: ["Review the new playbook before customer meetings."],
    });

    expect(text).toContain("AI-era cyber defense");
    expect(text).toContain("- Cisco published a customer playbook");
    expect(text).toContain("- Software distribution is moving");
    expect(text).not.toContain("Review the new playbook");
  });
});
