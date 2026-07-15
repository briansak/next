import { describe, expect, it } from "vitest";
import { parseEml } from "./eml";

describe("parseEml", () => {
  it("parses a simple plain-text message", () => {
    const eml = `From: Jane Doe <jane@wwt.com>
To: brian@example.com
Subject: [WWT] Weekly update
Date: Mon, 14 Jul 2026 10:00:00 +0000
Message-ID: <abc123@wwt.com>
Content-Type: text/plain; charset=utf-8

Please review the attached PSA deck by Friday.`;

    const parsed = parseEml(eml);
    expect(parsed).not.toBeNull();
    expect(parsed?.fromAddress).toBe("jane@wwt.com");
    expect(parsed?.fromName).toBe("Jane Doe");
    expect(parsed?.subject).toBe("[WWT] Weekly update");
    expect(parsed?.messageId).toBe("abc123@wwt.com");
    expect(parsed?.body).toContain("PSA deck");
    expect(parsed?.toAddresses).toEqual(["brian@example.com"]);
  });

  it("prefers text/plain in multipart messages", () => {
    const eml = `From: Partner <partner@wwt.com>
Subject: [WWT] Sync notes
Date: Tue, 15 Jul 2026 12:00:00 +0000
Content-Type: multipart/alternative; boundary="abc"

--abc
Content-Type: text/plain

Action item: send security update.

--abc
Content-Type: text/html

<html><body><p>Action item: send security update.</p></body></html>

--abc--`;

    const parsed = parseEml(eml);
    expect(parsed?.body).toBe("Action item: send security update.");
  });

  it("returns null when From is missing", () => {
    expect(parseEml("Subject: Hi\n\nBody")).toBeNull();
  });
});
