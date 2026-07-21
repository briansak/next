import type { Prisma } from "@prisma/client";
import { generateOllamaJson } from "./ollama";

export interface DealMessage {
  id: string;
  body: string;
  authorName: string | null;
  receivedAt: Date;
  mentionedUserIds?: string[];
}

export interface DealSpaceSummary {
  text: string;
  asks: string[];
  decisions: string[];
  nextSteps: string[];
  source: "ollama" | "heuristic";
  label: string;
  messageCount: number;
}

interface DealSummaryCache {
  text: string;
  asks: string[];
  decisions: string[];
  nextSteps: string[];
  source: "ollama" | "heuristic";
  at: string;
  messageCount: number;
}

const QUESTION_RE = /[^.!?\n]*\?/g;
const DECISION_RE =
  /\b(decided|approved|confirmed|moving forward|will proceed|signed off|greenlit|go live)\b/i;
const NEXT_STEP_RE =
  /\b(next step|follow up|action item|by (?:monday|tuesday|wednesday|thursday|friday|tomorrow)|need to|please send|can you)\b/i;
const MAX_MESSAGES = 40;
const CACHE_TTL_MS = 30 * 60 * 1000;

function plainText(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

function extractMatches(messages: DealMessage[], pattern: RegExp, max = 5): string[] {
  const matches = new Set<string>();
  for (const message of messages) {
    const text = plainText(message.body);
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length >= 16 && trimmed.length <= 240 && pattern.test(trimmed)) {
        matches.add(trimmed);
      }
    }
  }
  return [...matches].slice(0, max);
}

function extractQuestions(messages: DealMessage[]): string[] {
  const questions = new Set<string>();
  for (const message of messages) {
    const text = plainText(message.body);
    for (const match of text.match(QUESTION_RE) ?? []) {
      const trimmed = match.trim();
      if (trimmed.length >= 12 && trimmed.length <= 240) {
        questions.add(trimmed);
      }
    }
  }
  return [...questions].slice(0, 5);
}

export function buildHeuristicDealSpaceSummary(
  spaceTitle: string,
  dealLabel: string | null,
  messages: DealMessage[]
): DealSpaceSummary {
  const recent = [...messages]
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, MAX_MESSAGES);

  const asks = extractQuestions(recent);
  const decisions = extractMatches(recent, DECISION_RE, 4);
  const nextSteps = extractMatches(recent, NEXT_STEP_RE, 5);
  const label = dealLabel ?? "Active deal";

  if (recent.length === 0) {
    return {
      text: `No recent messages in ${spaceTitle}. Add this deal space in Settings and sync Webex.`,
      asks: [],
      decisions: [],
      nextSteps: [],
      source: "heuristic",
      label,
      messageCount: 0,
    };
  }

  const parts = [
    `${recent.length} recent update${recent.length === 1 ? "" : "s"} in ${spaceTitle}.`,
  ];
  if (decisions.length > 0) {
    parts.push(`Recent decisions: ${decisions.slice(0, 2).join(" ")}`);
  } else if (asks.length > 0) {
    parts.push(`Open questions: ${asks.slice(0, 2).join(" ")}`);
  } else {
    parts.push("Team is actively coordinating on this deal.");
  }
  if (nextSteps.length > 0) {
    parts.push(`Follow-ups mentioned: ${nextSteps.slice(0, 2).join(" ")}`);
  }

  return {
    text: parts.join(" "),
    asks,
    decisions,
    nextSteps,
    source: "heuristic",
    label,
    messageCount: recent.length,
  };
}

export async function summarizeDealSpaceWithOllama(
  spaceTitle: string,
  dealLabel: string | null,
  messages: DealMessage[]
): Promise<DealSpaceSummary | null> {
  if (!process.env.OLLAMA_BASE_URL?.trim() || messages.length === 0) return null;

  const recent = [...messages]
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, MAX_MESSAGES);

  const transcript = recent
    .map((message) => {
      const author = message.authorName ?? "Unknown";
      return `${author}: ${plainText(message.body).slice(0, 500)}`;
    })
    .join("\n");

  const focus = dealLabel
    ? `${dealLabel} customer/partner deal coordination`
    : "active deal coordination with partner and customer";

  const prompt = `You are summarizing a Webex deal space for a partner coverage team.
Focus on ${focus}. Extract what changed, what is blocked, and what needs to happen next.
Respond in JSON only:
{
  "summary": "3-5 sentence deal status update",
  "asks": ["open question or blocker"],
  "decisions": ["decision or commitment made"],
  "nextSteps": ["concrete follow-up"]
}

Space: ${spaceTitle}
Messages:
${transcript.slice(0, 10_000)}`;

  const parsed = await generateOllamaJson<{
    summary?: string;
    asks?: string[];
    decisions?: string[];
    nextSteps?: string[];
  }>(prompt, { timeoutMs: 90_000 });

  if (!parsed?.summary?.trim()) return null;

  return {
    text: parsed.summary.trim(),
    asks: (parsed.asks ?? []).filter(Boolean).slice(0, 5),
    decisions: (parsed.decisions ?? []).filter(Boolean).slice(0, 5),
    nextSteps: (parsed.nextSteps ?? []).filter(Boolean).slice(0, 5),
    source: "ollama",
    label: dealLabel ?? "AI summary",
    messageCount: recent.length,
  };
}

function readSummaryCache(
  cache: unknown,
  messageCount: number
): DealSpaceSummary | null {
  if (!cache || typeof cache !== "object") return null;
  const data = cache as DealSummaryCache;
  if (!data.text || !data.at) return null;
  const age = Date.now() - new Date(data.at).getTime();
  if (age > CACHE_TTL_MS) return null;
  if (data.messageCount !== messageCount) return null;

  return {
    text: data.text,
    asks: data.asks ?? [],
    decisions: data.decisions ?? [],
    nextSteps: data.nextSteps ?? [],
    source: data.source ?? "heuristic",
    label: "Cached summary",
    messageCount: data.messageCount,
  };
}

export function dealSummaryCachePayload(
  summary: DealSpaceSummary
): Prisma.InputJsonValue {
  return {
    text: summary.text,
    asks: summary.asks,
    decisions: summary.decisions,
    nextSteps: summary.nextSteps,
    source: summary.source,
    at: new Date().toISOString(),
    messageCount: summary.messageCount,
  };
}

export async function resolveDealSpaceSummary(input: {
  allowlistId: string;
  spaceTitle: string;
  dealLabel: string | null;
  messages: DealMessage[];
  cache: unknown;
  allowOllama?: boolean;
  persistCache?: (cache: Prisma.InputJsonValue) => Promise<void>;
}): Promise<DealSpaceSummary> {
  const cached = readSummaryCache(input.cache, input.messages.length);
  if (cached && (cached.source === "ollama" || input.allowOllama !== true)) {
    return cached;
  }

  const ollama =
    input.allowOllama === false
      ? null
      : await summarizeDealSpaceWithOllama(
          input.spaceTitle,
          input.dealLabel,
          input.messages
        );

  const summary =
    ollama ??
    buildHeuristicDealSpaceSummary(
      input.spaceTitle,
      input.dealLabel,
      input.messages
    );

  if (input.persistCache) {
    await input.persistCache(dealSummaryCachePayload(summary)).catch(() => undefined);
  }

  return summary;
}
