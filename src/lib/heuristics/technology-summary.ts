import type { Prisma } from "@prisma/client";

export interface TechnologyMessage {
  id: string;
  body: string;
  authorName: string | null;
  receivedAt: Date;
  mentionedUserIds?: string[];
}

export interface TechnologySpaceSummary {
  text: string;
  asks: string[];
  responses: string[];
  themes: string[];
  source: "ollama" | "heuristic";
  label: string;
  messageCount: number;
}

interface TechnologySummaryCache {
  text: string;
  asks: string[];
  responses: string[];
  themes: string[];
  source: "ollama" | "heuristic";
  at: string;
  messageCount: number;
}

const QUESTION_RE = /[^.!?\n]*\?/g;
const MAX_MESSAGES = 40;
const CACHE_TTL_MS = 30 * 60 * 1000;

function plainText(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

function extractQuestions(messages: TechnologyMessage[]): string[] {
  const questions = new Set<string>();
  for (const message of messages) {
    const text = plainText(message.body);
    const matches = text.match(QUESTION_RE) ?? [];
    for (const match of matches) {
      const trimmed = match.trim();
      if (trimmed.length >= 12 && trimmed.length <= 240) {
        questions.add(trimmed);
      }
    }
  }
  return [...questions].slice(0, 5);
}

function extractThemes(messages: TechnologyMessage[]): string[] {
  const keywords = [
    "support",
    "gtm",
    "pricing",
    "roadmap",
    "deployment",
    "integration",
    "security",
    "upgrade",
    "migration",
    "poc",
    "pilot",
    "customer",
    "partner",
    "competitive",
    "training",
    "certification",
    "bug",
    "issue",
    "escalation",
  ];
  const text = messages.map((m) => plainText(m.body).toLowerCase()).join(" ");
  return keywords.filter((word) => text.includes(word)).slice(0, 6);
}

export function buildHeuristicTechnologySpaceSummary(
  spaceTitle: string,
  technologyLabel: string | null,
  messages: TechnologyMessage[]
): TechnologySpaceSummary {
  const recent = [...messages]
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, MAX_MESSAGES);

  const asks = extractQuestions(recent);
  const themes = extractThemes(recent);
  const authors = [
    ...new Set(recent.map((m) => m.authorName).filter(Boolean) as string[]),
  ].slice(0, 5);

  const mentionCount = recent.filter(
    (m) => (m.mentionedUserIds?.length ?? 0) > 0
  ).length;

  const label = technologyLabel ?? "Technology space";
  const parts: string[] = [];

  if (recent.length === 0) {
    return {
      text: `No recent messages in ${spaceTitle}. Sync Webex or check that this space is active.`,
      asks: [],
      responses: [],
      themes: [],
      source: "heuristic",
      label,
      messageCount: 0,
    };
  }

  parts.push(
    `${recent.length} recent message${recent.length === 1 ? "" : "s"} in ${spaceTitle}.`
  );

  if (authors.length > 0) {
    parts.push(`Active participants include ${authors.join(", ")}.`);
  }

  if (asks.length > 0) {
    parts.push(`Open questions include: ${asks.slice(0, 2).join(" ")}`);
  } else if (mentionCount > 0) {
    parts.push(`${mentionCount} message${mentionCount === 1 ? "" : "s"} directly @mentioned someone on the team.`);
  } else {
    parts.push("Discussion is ongoing without a clear open question in recent traffic.");
  }

  if (themes.length > 0) {
    parts.push(`Topics touched: ${themes.join(", ")}.`);
  }

  const responses = recent
    .filter((m) => !asks.some((ask) => plainText(m.body).includes(ask)))
    .slice(0, 3)
    .map((m) => {
      const text = plainText(m.body);
      return text.length > 160 ? `${text.slice(0, 157)}…` : text;
    });

  return {
    text: parts.join(" "),
    asks,
    responses,
    themes,
    source: "heuristic",
    label,
    messageCount: recent.length,
  };
}

export async function summarizeTechnologySpaceWithOllama(
  spaceTitle: string,
  technologyLabel: string | null,
  messages: TechnologyMessage[]
): Promise<TechnologySpaceSummary | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  const model = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
  if (!baseUrl || messages.length === 0) return null;

  const recent = [...messages]
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, MAX_MESSAGES);

  const transcript = recent
    .map((m) => {
      const author = m.authorName ?? "Unknown";
      const text = plainText(m.body).slice(0, 500);
      return `${author}: ${text}`;
    })
    .join("\n");

  const focus = technologyLabel
    ? `${technologyLabel} technology / product discussions`
    : "technology, support, and GTM discussions";

  const prompt = `You are summarizing a Webex space for a partner coverage team.
Focus on ${focus}. Identify what people are asking, what has been answered, and what is still being discussed.
Respond in JSON only:
{
  "summary": "3-5 sentences",
  "asks": ["open question or request 1", "..."],
  "responses": ["notable answer or update 1", "..."],
  "themes": ["topic1", "topic2"]
}

Space: ${spaceTitle}
Recent messages:
${transcript.slice(0, 10_000)}`;

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { response: string };
    const parsed = JSON.parse(data.response) as {
      summary?: string;
      asks?: string[];
      responses?: string[];
      themes?: string[];
    };

    if (!parsed.summary?.trim()) return null;

    return {
      text: parsed.summary.trim(),
      asks: (parsed.asks ?? []).filter(Boolean).slice(0, 5),
      responses: (parsed.responses ?? []).filter(Boolean).slice(0, 5),
      themes: (parsed.themes ?? []).filter(Boolean).slice(0, 6),
      source: "ollama",
      label: technologyLabel ?? "AI summary",
      messageCount: recent.length,
    };
  } catch {
    return null;
  }
}

function readSummaryCache(
  cache: unknown,
  messageCount: number
): TechnologySpaceSummary | null {
  if (!cache || typeof cache !== "object") return null;
  const data = cache as TechnologySummaryCache;
  if (!data.text || !data.at) return null;

  const age = Date.now() - new Date(data.at).getTime();
  if (age > CACHE_TTL_MS) return null;
  if (data.messageCount !== messageCount) return null;

  return {
    text: data.text,
    asks: data.asks ?? [],
    responses: data.responses ?? [],
    themes: data.themes ?? [],
    source: data.source ?? "heuristic",
    label: "Cached summary",
    messageCount: data.messageCount,
  };
}

export function technologySummaryCachePayload(
  summary: TechnologySpaceSummary
): Prisma.InputJsonValue {
  return {
    text: summary.text,
    asks: summary.asks,
    responses: summary.responses,
    themes: summary.themes,
    source: summary.source,
    at: new Date().toISOString(),
    messageCount: summary.messageCount,
  };
}

export async function resolveTechnologySpaceSummary(input: {
  allowlistId: string;
  spaceTitle: string;
  technologyLabel: string | null;
  messages: TechnologyMessage[];
  cache: unknown;
  allowOllama?: boolean;
  persistCache?: (cache: Prisma.InputJsonValue) => Promise<void>;
}): Promise<TechnologySpaceSummary> {
  const cached = readSummaryCache(input.cache, input.messages.length);
  if (cached) return cached;

  const ollama =
    input.allowOllama === false
      ? null
      : await summarizeTechnologySpaceWithOllama(
          input.spaceTitle,
          input.technologyLabel,
          input.messages
        );

  const summary =
    ollama ??
    buildHeuristicTechnologySpaceSummary(
      input.spaceTitle,
      input.technologyLabel,
      input.messages
    );

  if (input.persistCache) {
    await input.persistCache(technologySummaryCachePayload(summary)).catch(
      () => undefined
    );
  }

  return summary;
}
