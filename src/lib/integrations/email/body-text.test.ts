import { describe, expect, it } from "vitest";
import {
  fixMojibake,
  isLikelyBase64Text,
  normalizeEmailBodyText,
  tryDecodeBase64Text,
} from "./body-text";

const TOWN_HALL_BASE64 = `SWYgeW91IGhhdmUgdHJvdWJsZSB2aWV3aW5nIHRoaXMgZW1haWwsIHJlYWQgdGhlIG9ubGluZSB2
ZXJzaW9uLg0KW2h0dHBzOi8vczE4NjUyODMxNzEudC5lbjI1LmNvbS9lL2VzLmFzcHg/cz0xODY1
MjgzMTcxJmU9NDUyOTQxJmVscT03Y2MyOGJkZDhlNTM0OTZjYmI0NTM1Y2UyMTMyNDZiOV0gICAg
IA0KDQoNClRoYW5rIHlvdSB0byBldmVyeW9uZSB3aG8gam9pbmVkIE1vbmRheeKAmXMgc3BlY2lh
bCBlZGl0aW9uIEdsb2JhbCBTYWxlcyBUb3duIEhhbGwuIElmIHlvdSBtaXNzZWQgaXQsIHdhdGNo
IHRoZSByZXBsYXkgaGVyZSA8aHR0cHM6Ly9hcHAuY2FtcGFpZ25tZ3IuY2lzY28uY29tL2UvZXI/
cz0xODY1MjgzMTcxJmxpZD0xOTY0NDQmZWxxVHJhY2tJZD1GNjQ0OUNCMjYzNjEyODkzNkJFRjdB
NzY4OUJDQjNFRCZlbHE9N2NjMjhiZGQ4ZTUzNDk2Y2JiNDUzNWNlMjEzMjQ2YjkmZWxxYWlkPTU1
OTQwJmVscWF0PTEmZWxxYWs9OEFGNTY3QUNEMUY2QTc3QkJBMTk1RDEwRDM3RjhBNDlCRkUwNUJD
RkY5RTUxQUIzNUJGNzRFQ0E4NjA3NDc5NENDRUI+LiANCg0KV2UgZm9jdXNlZCBlbnRpcmVseSBv
biB0aGUgQUktRXJhIEN5YmVyIERlZmVuc2UgY29udmVyc2F0aW9ucyBjdXN0b21lcnMgYW5kIHBh
cnRuZXJzIGFyZSBoYXZpbmcgcmlnaHQgbm93LCBhbmQgdGhlIHdheXMgd2UgY2FuIGhlbHAgdGhl
bSBuYXZpZ2F0ZSByaXNrIGFuZCBwcm90ZWN0IHRoZWlyIG9yZ2FuaXphdGlvbnMu`;

describe("tryDecodeBase64Text", () => {
  it("decodes Cisco campaign base64 email bodies", () => {
    expect(isLikelyBase64Text(TOWN_HALL_BASE64)).toBe(true);
    const decoded = tryDecodeBase64Text(TOWN_HALL_BASE64);
    expect(decoded).toContain("AI-Era Cyber Defense");
    expect(decoded).toContain("watch the replay here");
  });
});

describe("fixMojibake", () => {
  it("repairs common UTF-8-as-Latin-1 sequences", () => {
    expect(fixMojibake("Denver â€“ three days")).toBe("Denver – three days");
    expect(fixMojibake("Itâ€™s time")).toBe("It's time");
    expect(fixMojibake("Donâ€™t wait")).toBe("Don't wait");
  });
});

describe("normalizeEmailBodyText", () => {
  it("returns readable text from encoded marketing email", () => {
    const text = normalizeEmailBodyText(TOWN_HALL_BASE64);
    expect(text).toContain("AI-Era Cyber Defense");
    expect(text).toContain("customers and partners");
    expect(text).not.toMatch(/^[A-Za-z0-9+/]{40,}/);
  });
});
