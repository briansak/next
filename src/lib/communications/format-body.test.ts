import { describe, expect, it } from "vitest";
import { formatCommunicationBody } from "./format-body";

describe("formatCommunicationBody", () => {
  it("strips html and preserves line breaks", () => {
    const formatted = formatCommunicationBody(
      "<p>Hello team</p><p>Can you review the deck?</p>"
    );
    expect(formatted).toContain("Hello team");
    expect(formatted).toContain("review the deck");
  });
});
