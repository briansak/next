import { describe, expect, it } from "vitest";
import {
  extractReplayEmailSummary,
  extractReplayTitleFromSubject,
  extractReplayUrl,
  isReplayNotificationEmail,
  parseReplayEmail,
} from "./replay-email";

describe("isReplayNotificationEmail", () => {
  it("detects Replay: subject prefix", () => {
    expect(
      isReplayNotificationEmail("Replay: AI-Era Cyber Defense Town Hall", "")
    ).toBe(true);
  });

  it("detects catch the replay in body", () => {
    expect(
      isReplayNotificationEmail("If you give a bot some network bandwidth...", "Catch the replay on the Bridge.")
    ).toBe(true);
  });
});

describe("extractReplayTitleFromSubject", () => {
  it("strips Replay prefix", () => {
    expect(extractReplayTitleFromSubject("Replay: AI-Era Cyber Defense Town Hall")).toBe(
      "AI-Era Cyber Defense Town Hall"
    );
  });
});

describe("extractReplayUrl", () => {
  it("prefers anchor links with replay wording", () => {
    const html = `
      <p>The town hall recording is ready.</p>
      <a href="https://wwt.webex.com/recordings/abc123">Watch replay</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    `;
    expect(extractReplayUrl(html)).toBe(
      "https://wwt.webex.com/recordings/abc123"
    );
  });

  it("extracts SharePoint Bridge links", () => {
    const html = `
      <a href="https://wwt.sharepoint.com/sites/bridge/Sessions/bot-bandwidth">Check out the replay on the Bridge</a>
    `;
    expect(extractReplayUrl(html)).toContain("sharepoint.com/sites/bridge");
  });

  it("extracts replay URL from anchor text 'here' with nearby replay wording", () => {
    const html = `
      <p>You can watch the replay <a href="https://app.vidcast.io/share/abc123">here</a>.</p>
    `;
    expect(extractReplayUrl(html)).toBe("https://app.vidcast.io/share/abc123");
  });

  it("extracts replay URL from click here anchor with recording context", () => {
    const html = `
      <p>Missed the session? <a href="https://wwt.webex.com/recordings/xyz">click here</a> to watch the recording.</p>
    `;
    expect(extractReplayUrl(html)).toContain("webex.com/recordings");
  });

  it("extracts replay URL from plain text watch the replay here", () => {
    const text =
      "If you missed it, watch the replay here https://app.campaignmgr.cisco.com/e/er?s=123";
    expect(extractReplayUrl(text)).toContain("campaignmgr.cisco.com");
  });
});

describe("extractReplayEmailSummary", () => {
  it("preserves Bridge session structure", () => {
    const body = `
      <p>The latest on our portfolio, all in one click</p>
      <p>What's the story? In this session, Jeetu explores the transformative shift from chatbots to sophisticated AI agents.</p>
      <p>A closer look: There are massive opportunities ahead for Cisco. The session features three exclusive live demos: Cisco Cloud Control, AgenticOps, and Splunk Agent Observability powered by Galileo.</p>
      <p>What's next? Catch the replay and mark your calendar for the next session on Wednesday, September 23.</p>
      <p>Check out the replay on the Bridge.</p>
    `;

    const summary = extractReplayEmailSummary(
      body,
      "If you give a bot some network bandwidth..."
    );

    expect(summary).toContain("What's the story?");
    expect(summary).toContain("AgenticOps");
    expect(summary).toContain("September 23");
    expect(summary).not.toContain("Check out the replay on the Bridge");
  });
});

describe("parseReplayEmail", () => {
  it("parses a town hall replay notification", () => {
    const parsed = parseReplayEmail({
      messageId: "replay-1",
      subject: "Replay: AI-Era Cyber Defense Town Hall",
      fromAddress: "events@wwt.com",
      receivedAt: new Date("2026-07-14T18:00:00Z"),
      body: `
        <p>Thanks for joining the AI-Era Cyber Defense Town Hall. If you missed it, catch up below.</p>
        <p>We covered threat trends, AI-assisted detection, and partner enablement priorities for Q3.</p>
        <a href="https://wwt.webex.com/recordings/abc123">Watch replay</a>
      `,
      threadId: null,
      toAddresses: [],
      ccAddresses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.meetingTitle).toBe("AI-Era Cyber Defense Town Hall");
    expect(parsed?.replayUrl).toContain("webex.com/recordings");
    expect(parsed?.summary).toContain("threat trends");
  });

  it("parses a Bridge portfolio session replay with SharePoint link", () => {
    const parsed = parseReplayEmail({
      messageId: "bridge-replay-1",
      subject: "If you give a bot some network bandwidth...",
      fromAddress: "bridge@wwt.com",
      receivedAt: new Date("2026-07-10T16:00:00Z"),
      body: `
        <p>The latest on our portfolio, all in one click</p>
        <p>What's the story? In this session, Jeetu explores the transformative shift from chatbots to sophisticated AI agents and the critical infrastructure demands required to scale AI effectively.</p>
        <p>A closer look: There are massive opportunities ahead for Cisco as we redefine the platform landscape. The session features three exclusive live demos: Cisco Cloud Control, AgenticOps, and Splunk Agent Observability powered by Galileo.</p>
        <p>What's next? Catch the replay and mark your calendar for the next session on Wednesday, September 23.</p>
        <a href="https://wwt.sharepoint.com/sites/bridge/Sessions/bot-bandwidth">Check out the replay on the Bridge</a>
      `,
      threadId: null,
      toAddresses: [],
      ccAddresses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.meetingTitle).toBe("If you give a bot some network bandwidth...");
    expect(parsed?.replayUrl).toContain("sharepoint.com/sites/bridge");
    expect(parsed?.replayPlatform).toBe("sharepoint");
    expect(parsed?.summary).toContain("What's the story?");
    expect(parsed?.summary).toContain("AgenticOps");
    expect(parsed?.summary).toContain("September 23");
    expect(parsed?.summary).not.toContain("Check out the replay on the Bridge");
  });

  it("parses a Cisco town hall replay from base64 campaign email", () => {
    const parsed = parseReplayEmail({
      messageId: "cisco-town-hall-1",
      subject: "Replay: AI-Era Cyber Defense Town Hall",
      fromAddress: "noreply@cisco.com",
      receivedAt: new Date("2026-07-14T18:00:00Z"),
      body: `SWYgeW91IGhhdmUgdHJvdWJsZSB2aWV3aW5nIHRoaXMgZW1haWwsIHJlYWQgdGhlIG9ubGluZSB2
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
bSBuYXZpZ2F0ZSByaXNrIGFuZCBwcm90ZWN0IHRoZWlyIG9yZ2FuaXphdGlvbnMu`,
      threadId: null,
      toAddresses: [],
      ccAddresses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.summary).toContain("AI-Era Cyber Defense");
    expect(parsed?.summary).toContain("customers and partners");
    expect(parsed?.summary).not.toMatch(/^[A-Za-z0-9+/]{40,}/);
    expect(parsed?.replayUrl).toContain("campaignmgr.cisco.com");
    expect(parsed?.replayPlatform).toBe("cisco");
  });
});
