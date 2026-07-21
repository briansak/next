import { describe, expect, it } from "vitest";
import { buildMorningBrief } from "./morning-brief";
import type { PartnerAskItem } from "./partner-asks";

describe("buildMorningBrief", () => {
  it("builds greeting and top priorities from stale asks", () => {
    const ask: PartnerAskItem = {
      communicationId: "comm-1",
      subject: "POV pricing",
      ask: "Can you confirm pricing for the POV?",
      source: "EMAIL",
      priority: "HIGH",
      receivedAt: new Date("2026-07-13T12:00:00Z"),
      authorName: "Alex",
    };

    const brief = buildMorningBrief({
      userName: "Brian Sak",
      now: new Date("2026-07-16T12:00:00Z"),
      partnerAsks: [ask],
      staleAsks: [
        {
          ...ask,
          sla: {
            severity: "critical",
            label: "3d overdue",
            hoursOpen: 72,
            slaHours: 48,
          },
        },
      ],
      upcomingMeetings: [],
      commitments: [],
      planningEventCount: 0,
      mentionedCount: 0,
    });

    expect(brief.greeting).toContain("Brian");
    expect(brief.priorities[0]?.kind).toBe("stale-ask");
    expect(brief.staleAskCount).toBe(1);
  });
});
