import { describe, expect, it } from "vitest";
import { emlxToEml } from "./emlx";
import { splitMbox } from "./mbox";

describe("emlxToEml", () => {
  it("strips byte-count header line", () => {
    const emlx = `412
From: jane@wwt.com
Subject: [WWT] Test
Date: Mon, 14 Jul 2026 10:00:00 +0000

Hello team`;

    const eml = emlxToEml(emlx);
    expect(eml).toContain("From: jane@wwt.com");
    expect(eml).toContain("Hello team");
    expect(eml).not.toMatch(/^412$/m);
  });
});

describe("splitMbox", () => {
  it("splits mbox into separate messages", () => {
    const mbox = `From jane@wwt.com Mon Jul 14 10:00:00 2026
From: jane@wwt.com
Subject: One
Date: Mon, 14 Jul 2026 10:00:00 +0000

First

From jane@wwt.com Mon Jul 14 11:00:00 2026
From: jane@wwt.com
Subject: Two
Date: Mon, 14 Jul 2026 11:00:00 +0000

Second`;

    const messages = splitMbox(mbox);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("Subject: One");
    expect(messages[1]).toContain("Subject: Two");
  });
});
