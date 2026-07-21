import { describe, expect, it } from "vitest";
import { parseRowIdFromEmlxPath } from "./apple-mail-envelope";

describe("parseRowIdFromEmlxPath", () => {
  it("parses full and partial emlx filenames", () => {
    expect(
      parseRowIdFromEmlxPath(
        "/Users/me/Library/Mail/V10/Inbox.mbox/Data/7/1/1/Messages/117582.partial.emlx"
      )
    ).toBe(117582);
    expect(
      parseRowIdFromEmlxPath(
        "/Users/me/Library/Mail/V10/Inbox.mbox/Data/Messages/140019.emlx"
      )
    ).toBe(140019);
  });
});
