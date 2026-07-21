import { describe, expect, it } from "vitest";
import { isAutomatedNotificationText, isBoilerplateQuestion } from "./boilerplate-questions";

describe("isBoilerplateQuestion", () => {
  it("flags signature help lines", () => {
    expect(isBoilerplateQuestion("Need help?")).toBe(true);
    expect(isBoilerplateQuestion("Can I help you?")).toBe(true);
    expect(isBoilerplateQuestion("Questions?")).toBe(true);
  });

  it("allows real partner asks", () => {
    expect(
      isBoilerplateQuestion("What availability do you have next week for a WWT customer session?")
    ).toBe(false);
    expect(
      isBoilerplateQuestion("I was wondering if you had anything you could share yet on that viewpoint.")
    ).toBe(false);
  });

  it("flags event registration subjects with trailing Questions?", () => {
    expect(
      isBoilerplateQuestion(
        "You're registered for a WWT event: Cisco CTF - Neuro Nemesis - July 29 Questions?"
      )
    ).toBe(true);
    expect(
      isAutomatedNotificationText(
        "You're registered for a WWT event: Cisco CTF - Neuro Nemesis - July 29"
      )
    ).toBe(true);
  });
});
