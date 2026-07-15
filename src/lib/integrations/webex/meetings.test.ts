import { describe, it, expect } from "vitest";
import {
  meetingRelevantToEmails,
  buildMeetingBody,
  collectEmails,
  meetingVisibleToUser,
} from "./meetings";
import type { WebexMeeting, MeetingEnrichment } from "./meetings";

describe("meeting helpers", () => {
  it("detects tenant members relevant to a meeting", () => {
    const relevant = meetingRelevantToEmails(
      ["brian@example.com", "host@wwt.com"],
      ["brian@example.com", "other@wwt.com"]
    );
    expect(relevant).toEqual(["brian@example.com"]);
  });

  it("collects emails from host, invitees, and participants", () => {
    const meeting: WebexMeeting = {
      id: "m1",
      title: "Security sync",
      meetingType: "meeting",
      start: "2026-07-14T15:00:00Z",
      hostEmail: "host@wwt.com",
    };
    const enrichment: MeetingEnrichment = {
      invitees: [{ email: "brian@example.com" }],
      participants: [{ email: "brian@example.com" }],
      recordings: [],
      transcripts: [],
    };

    const emails = collectEmails(meeting, enrichment);
    expect(emails).toContain("host@wwt.com");
    expect(emails).toContain("brian@example.com");
  });

  it("builds body with AI summary and action items", () => {
    const meeting: WebexMeeting = {
      id: "m1",
      title: "WWT Engineering",
      meetingType: "meeting",
      start: "2026-07-14T15:00:00Z",
      hostEmail: "host@wwt.com",
    };
    const enrichment: MeetingEnrichment = {
      summary: {
        id: "s1",
        meetingId: "m1",
        note: "Discussed rollout timeline.",
        actionItems: ["Send security update", "Schedule follow-up"],
      },
      invitees: [],
      participants: [],
      recordings: [],
      transcripts: [],
    };

    const body = buildMeetingBody(meeting, enrichment);
    expect(body).toContain("AI Summary");
    expect(body).toContain("Discussed rollout timeline");
    expect(body).toContain("Send security update");
  });

  it("shows all meetings to admins and filters members by email", () => {
    const meta = {
      relevantUserEmails: ["brsak@cisco.com"],
      connectedAccountEmails: ["brsak@cisco.com"],
    };
    expect(meetingVisibleToUser(meta, "brsak@cisco.com", false)).toBe(true);
    expect(meetingVisibleToUser(meta, "admin@example.com", false)).toBe(false);
    expect(meetingVisibleToUser(meta, "admin@example.com", true)).toBe(true);
  });
});
