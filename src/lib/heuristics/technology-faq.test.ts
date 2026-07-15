import { describe, expect, it } from "vitest";
import {
  buildHeuristicTechnologyFaq,
  distillFaqAnswer,
  extractUrls,
  findThreadRoot,
  groupIntoThreads,
  reformulateFaqQuestion,
  type TechnologyThreadMessage,
} from "./technology-faq";

function msg(
  externalId: string,
  overrides: Partial<TechnologyThreadMessage> = {}
): TechnologyThreadMessage {
  return {
    id: externalId,
    externalId,
    body: "Message body",
    authorName: "Alex",
    receivedAt: new Date("2026-07-14T10:00:00Z"),
    threadId: "room-1",
    parentId: null,
    roomId: "room-1",
    ...overrides,
  };
}

describe("groupIntoThreads", () => {
  it("groups a question and reply into one thread", () => {
    const messages = [
      msg("root-1", {
        body: "How do we enable TLS 1.3 on the load balancer?",
        receivedAt: new Date("2026-07-14T10:00:00Z"),
      }),
      msg("reply-1", {
        body: "Use the admin guide here https://docs.example.com/tls",
        threadId: "root-1",
        parentId: "root-1",
        receivedAt: new Date("2026-07-14T10:05:00Z"),
      }),
    ];

    const threads = groupIntoThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(2);
    expect(findThreadRoot(messages[1], new Map(messages.map((m) => [m.externalId, m])))).toBe(
      "root-1"
    );
  });
});

describe("reformulateFaqQuestion", () => {
  it("strips customer preamble and reframes plans-to-support questions", () => {
    const raw =
      "quick question from a customer re:AI Defense, do we have plans to support Oracle Cloud?";
    expect(reformulateFaqQuestion(raw)).toBe(
      "Does AI Defense support Oracle Cloud?"
    );
  });
});

describe("distillFaqAnswer", () => {
  it("removes names and offline follow-up, keeping the quarter target", () => {
    const raw =
      "Sriram Sunny we are scoping this to support in Q1 depending on the customers demand. Please ping me offline to provide details about the specific customer ask so that we can prioritize.";
    expect(distillFaqAnswer(raw)).toBe("Targeting support in Q1.");
  });
});

describe("buildHeuristicTechnologyFaq", () => {
  it("distills a threaded question and answer with links", () => {
    const threads = groupIntoThreads([
      msg("root-1", {
        body: "Does the AP support 802.1X with certificate auth?",
        receivedAt: new Date("2026-07-14T09:00:00Z"),
      }),
      msg("reply-1", {
        body: "Yes — see https://vendor.example.com/8021x for the deployment steps.",
        threadId: "root-1",
        parentId: "root-1",
        authorName: "Jamie",
        receivedAt: new Date("2026-07-14T09:10:00Z"),
      }),
    ]);

    const faq = buildHeuristicTechnologyFaq(threads);
    expect(faq.entries).toHaveLength(1);
    expect(faq.entries[0].question).toContain("802.1X");
    expect(faq.entries[0].answer).toContain("deployment steps");
    expect(faq.entries[0].links).toContain("https://vendor.example.com/8021x");
  });

  it("distills messy customer questions into concise FAQ entries", () => {
    const threads = groupIntoThreads([
      msg("root-2", {
        body: "quick question from a customer re:AI Defense, do we have plans to support Oracle Cloud?",
        receivedAt: new Date("2026-07-14T11:00:00Z"),
      }),
      msg("reply-2", {
        body: "Sriram Sunny we are scoping this to support in Q1 depending on the customers demand. Please ping me offline to provide details about the specific customer ask so that we can prioritize.",
        threadId: "root-2",
        parentId: "root-2",
        authorName: "Jamie",
        receivedAt: new Date("2026-07-14T11:05:00Z"),
      }),
    ]);

    const faq = buildHeuristicTechnologyFaq(threads);
    expect(faq.entries).toHaveLength(1);
    expect(faq.entries[0].question).toBe("Does AI Defense support Oracle Cloud?");
    expect(faq.entries[0].answer).toBe("Targeting support in Q1.");
  });
});

describe("extractUrls", () => {
  it("strips trailing punctuation from URLs", () => {
    expect(
      extractUrls("See https://docs.example.com/guide). Thanks!")
    ).toEqual(["https://docs.example.com/guide"]);
  });
});
