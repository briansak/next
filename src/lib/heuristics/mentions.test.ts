import { describe, it, expect } from "vitest";
import {
  buildMentionAliases,
  detectMentions,
  detectSpokenReferences,
  textMentionsAlias,
  textReferencesAlias,
} from "./mentions";

describe("mentions", () => {
  const brian = {
    id: "user-1",
    name: "Brian Sak",
    email: "brian.sak@example.com",
  };

  it("builds aliases from name and email", () => {
    const aliases = buildMentionAliases(brian.name, brian.email);
    expect(aliases).toContain("Brian Sak");
    expect(aliases).toContain("Brian");
  });

  it("detects @Brian Sak", () => {
    expect(textMentionsAlias("Hey @Brian Sak can you review?", "Brian Sak")).toBe(true);
  });

  it("detects @Brian without matching unrelated names", () => {
    expect(textMentionsAlias("Hey @Brian can you review?", "Brian")).toBe(true);
    expect(textMentionsAlias("Hey @Brian Sak — ping", "Brian")).toBe(true);
    expect(textMentionsAlias("Hey @Brianna update the doc", "Brian")).toBe(false);
  });

  it("detects mentions for team members", () => {
    const matches = detectMentions(
      "@Brian Sak please send the WWT update",
      [brian, { id: "user-2", name: "Jane Doe", email: "jane@example.com" }]
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].userId).toBe("user-1");
    expect(matches[0].alias).toBe("Brian Sak");
  });

  it("returns empty when no mentions", () => {
    expect(detectMentions("General update for the team", [brian])).toHaveLength(0);
  });

  it("detects spoken name references without @", () => {
    expect(textReferencesAlias("Brian, can you send the update?", "Brian")).toBe(
      true
    );
    expect(
      detectSpokenReferences("Brian Sak will own the follow-up.", [brian])
    ).toHaveLength(1);
  });
});
