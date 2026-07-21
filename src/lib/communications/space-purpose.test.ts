import { describe, expect, it } from "vitest";
import { isDayJobCommunication } from "./space-purpose";

describe("isDayJobCommunication", () => {
  it("includes email and day-job Webex spaces", () => {
    expect(isDayJobCommunication("EMAIL", {})).toBe(true);
    expect(
      isDayJobCommunication("WEBEX", { spacePurpose: "PRIORITIES" })
    ).toBe(true);
    expect(isDayJobCommunication("WEBEX", {})).toBe(true);
    expect(isDayJobCommunication("WEBEX_MEETING", {})).toBe(true);
  });

  it("excludes technology and deal Webex spaces", () => {
    expect(
      isDayJobCommunication("WEBEX", { spacePurpose: "TECHNOLOGY" })
    ).toBe(false);
    expect(isDayJobCommunication("WEBEX", { spacePurpose: "DEAL" })).toBe(
      false
    );
  });

  it("excludes calendar and other sources", () => {
    expect(isDayJobCommunication("OUTLOOK_CALENDAR", {})).toBe(false);
  });
});
