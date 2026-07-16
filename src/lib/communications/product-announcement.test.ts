import { describe, expect, it } from "vitest";
import { isProductAnnouncementCommunication } from "./product-announcement";

describe("isProductAnnouncementCommunication", () => {
  it("detects tagged product announcement emails", () => {
    expect(isProductAnnouncementCommunication(["product-announcement"], {})).toBe(true);
  });

  it("detects metadata flag", () => {
    expect(
      isProductAnnouncementCommunication([], { productAnnouncement: true })
    ).toBe(true);
  });
});
