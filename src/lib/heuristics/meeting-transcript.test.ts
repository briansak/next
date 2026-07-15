import { describe, expect, it } from "vitest";
import {
  analyzeMeetingTranscript,
  extractTranscriptActionItems,
  mergeMeetingActionItems,
} from "./meeting-transcript";

describe("meeting transcript actions", () => {
  const team = [
    { id: "u-brian", name: "Brian Sak", email: "brsak@cisco.com" },
    { id: "u-jane", name: "Jane Doe", email: "jane@example.com" },
  ];

  it("extracts action items with spoken assignee references", () => {
    const transcript =
      "Thanks everyone. Brian, can you send the WWT security update by Friday? " +
      "Jane will schedule the follow-up with the customer next week.";

    const items = extractTranscriptActionItems(transcript, team, "u-brian");
    expect(items.length).toBeGreaterThanOrEqual(2);

    const brianItem = items.find((i) => i.title.includes("security update"));
    expect(brianItem?.assigneeUserIds).toContain("u-brian");
    expect(brianItem?.mentionsViewer).toBe(true);

    const janeItem = items.find((i) => i.title.includes("follow-up"));
    expect(janeItem?.assigneeUserIds).toContain("u-jane");
  });

  it("boosts priority when viewer is referenced in transcript", () => {
    const analysis = analyzeMeetingTranscript(
      "Brian Sak, please review the PSA deck and send feedback by EOD.",
      team,
      "u-brian"
    );

    expect(analysis.viewerMentioned).toBe(true);
    expect(analysis.viewerHasAssignedAction).toBe(true);
    expect(analysis.tags).toContain("mentioned-you");
    expect(analysis.tags).toContain("action-required");
    expect(analysis.priorityBoost).toBeGreaterThanOrEqual(6);
  });

  it("merges summary and transcript action items without duplicates", () => {
    const merged = mergeMeetingActionItems(
      ["Send security update", "Schedule follow-up"],
      [
        {
          title: "Brian, can you send the security update by Friday?",
          excerpt: "Brian, can you send the security update by Friday?",
          assigneeUserIds: ["u-brian"],
          assigneeAliases: ["Brian"],
          mentionsViewer: true,
        },
        {
          title: "New item from transcript only",
          excerpt: "New item from transcript only",
          assigneeUserIds: [],
          assigneeAliases: [],
          mentionsViewer: false,
        },
      ]
    );

    expect(merged.length).toBeGreaterThanOrEqual(3);
    expect(merged.map((m) => m.title)).toContain("Send security update");
    expect(merged.map((m) => m.title)).toContain("Schedule follow-up");
    expect(merged.map((m) => m.title)).toContain("New item from transcript only");
  });

  it("ignores sentences without action language", () => {
    const items = extractTranscriptActionItems(
      "We had a good discussion about the roadmap. Brian joined late.",
      team
    );
    expect(items).toHaveLength(0);
  });
});
