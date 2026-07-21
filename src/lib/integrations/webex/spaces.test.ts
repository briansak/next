import { describe, expect, it } from "vitest";
import { parseWebexNextLink } from "./index";

describe("parseWebexNextLink", () => {
  it("extracts the next page URL from a Link header", () => {
    const header =
      '<https://webexapis.com/v1/rooms?max=100&after=abc>; rel="next", ' +
      '<https://webexapis.com/v1/rooms?max=100>; rel="first"';

    expect(parseWebexNextLink(header)).toBe(
      "https://webexapis.com/v1/rooms?max=100&after=abc"
    );
  });

  it("returns null when no next link exists", () => {
    expect(parseWebexNextLink(null)).toBeNull();
    expect(parseWebexNextLink('<https://webexapis.com/v1/rooms>; rel="first"')).toBeNull();
  });
});
