import type { Prisma } from "@prisma/client";

export interface TechnologyThreadMessage {
  id: string;
  externalId: string;
  body: string;
  authorName: string | null;
  receivedAt: Date;
  threadId: string | null;
  parentId?: string | null;
  roomId: string;
}

export interface TechnologyFaqEntry {
  question: string;
  answer: string;
  links: string[];
  threadRootId?: string;
  lastUpdated?: string;
}

export interface TechnologySpaceFaq {
  entries: TechnologyFaqEntry[];
  source: "ollama" | "heuristic";
  threadCount: number;
  messageCount: number;
}

interface TechnologyFaqCache {
  entries: TechnologyFaqEntry[];
  source: "ollama" | "heuristic";
  threadCount: number;
  messageCount: number;
  cachedAt: string;
  faqVersion?: number;
}

export interface TechnologyThread {
  rootId: string;
  messages: TechnologyThreadMessage[];
}

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;
const MAX_THREADS = 20;
const MAX_FAQ_ENTRIES = 12;
const CACHE_TTL_MS = 30 * 60 * 1000;
const FAQ_CACHE_VERSION = 2;

function plainText(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

function capitalizeSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stripQuestionPreamble(text: string): string {
  let t = plainText(text);
  const preambles = [
    /^quick question(?: from a customer)?[:\s,]+/i,
    /^question(?: from a customer)?[:\s,]+/i,
    /^customer (?:ask|question)[:\s,]+/i,
    /^fyi[:\s,]+/i,
    /^hi (?:all|team)[,\s]+/i,
    /^hey (?:all|team)[,\s]+/i,
  ];
  for (const pattern of preambles) {
    t = t.replace(pattern, "");
  }
  return t.replace(/\bre:\s*/gi, "").trim();
}

function extractProductHint(text: string): string | null {
  const reProduct = text.match(/\bre:\s*([^,.?]+)/i);
  if (reProduct) return reProduct[1].trim();

  const about = text.match(/\babout\s+([^,.?]+)/i);
  if (about) return about[1].trim();

  return null;
}

function distillQuestion(text: string): string | null {
  const normalized = stripQuestionPreamble(text);
  if (!normalized.includes("?")) return null;

  const idx = normalized.indexOf("?");
  const before = normalized.slice(0, idx);
  const sentenceBreak = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "));
  const start = sentenceBreak >= 0 ? sentenceBreak + 2 : 0;
  const question = normalized.slice(start, idx + 1).trim();

  return question.length >= 8 ? question : null;
}

export function reformulateFaqQuestion(raw: string): string {
  const source = plainText(raw);
  const extracted = distillQuestion(source);
  let text = (extracted ?? source).replace(/\?+$/, "").trim();
  text = stripQuestionPreamble(text);

  const product = extractProductHint(source);

  const plansSupport = text.match(
    /(?:do we have )?plans? to support\s+(.+)$/i
  );
  if (plansSupport) {
    const target = plansSupport[1].trim();
    if (product) {
      return `Does ${product} support ${target}?`;
    }
    return `Are there plans to support ${target}?`;
  }

  const doesSupport = text.match(/^does\s+(.+?)\s+support\s+(.+)$/i);
  if (doesSupport) {
    return `Does ${doesSupport[1].trim()} support ${doesSupport[2].trim()}?`;
  }

  const canWe = text.match(/^can we\s+(.+)$/i);
  if (canWe) {
    return `Can we ${canWe[1].trim()}?`;
  }

  const isThere = text.match(/^is there\s+(.+)$/i);
  if (isThere) {
    return `Is there ${isThere[1].trim()}?`;
  }

  if (product && !/^does\s/i.test(text)) {
    const remainder = text
      .replace(new RegExp(product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      .replace(/^[,:\s]+/, "")
      .trim();
    if (remainder.length >= 8) {
      const reframed = reformulateFaqQuestion(remainder);
      if (reframed !== `${capitalizeSentence(remainder)}?`) return reframed;
      return `Does ${product} ${remainder}?`.replace(/\s+\?/, "?");
    }
  }

  return `${capitalizeSentence(text)}?`;
}

export function distillFaqAnswer(replyText: string): string {
  let text = plainText(replyText);

  text = text.replace(/^@[\w.-]+\s*/g, "");

  const yesNoMatch = text.match(/^(yes|no)\b[,\s—-]*/i);
  if (yesNoMatch) {
    const prefix = yesNoMatch[0];
    const rest = text.slice(prefix.length).trim();
    if (rest.length > 0 && rest.length <= 100) {
      return rest.endsWith(".") || rest.endsWith("!") ? rest : `${rest}.`;
    }
    return `${yesNoMatch[1].charAt(0).toUpperCase()}${yesNoMatch[1].slice(1).toLowerCase()}.`;
  }

  text = text.replace(
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?!(?:yes|no)\b)/,
    ""
  );

  text = text.replace(/\s*please ping me offline.*$/i, "");
  text = text.replace(/\s*please reach out.*$/i, "");
  text = text.replace(/\s*let me know.*$/i, "");
  text = text.replace(/\s*so that we can prioritize.*$/i, "");
  text = text.replace(/\s*depending on the customers? demand.*$/i, "");
  text = text.trim();

  const targetingQuarter = text.match(
    /\b(?:scoping|targeting|planning|planned|expect(?:ing)?)\b[^.]{0,80}?\b(in\s+)?(Q[1-4](?:\s+\d{4})?)\b/i
  );
  if (targetingQuarter) {
    const quarter = targetingQuarter[2].toUpperCase();
    return `Targeting support in ${quarter}.`;
  }

  const quarterOnly = text.match(/\b(in\s+)?(Q[1-4](?:\s+\d{4})?)\b/i);
  if (quarterOnly && /\b(?:scoping|targeting|support|roadmap|planned)\b/i.test(text)) {
    return `Targeting support in ${quarterOnly[2].toUpperCase()}.`;
  }

  const urlSafe = text.replace(URL_RE, (url) => url.replace(/\./g, "\u0000"));
  const firstSentence =
    urlSafe.match(/^[^.!?]+[.!?]?/)?.[0]?.replace(/\u0000/g, ".")?.trim() ?? text;
  if (firstSentence.length <= 120) {
    if (firstSentence.endsWith(".") || firstSentence.endsWith("!")) {
      return firstSentence;
    }
    return `${firstSentence}.`;
  }

  return `${firstSentence.slice(0, 117).trim()}…`;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return [
    ...new Set(
      matches.map((url) => url.replace(/[.,;:!?)]+$/, "").trim()).filter(Boolean)
    ),
  ];
}

function getParentId(message: TechnologyThreadMessage): string | null {
  if (message.parentId) return message.parentId;
  if (message.threadId && message.threadId !== message.roomId) {
    return message.threadId;
  }
  return null;
}

export function findThreadRoot(
  message: TechnologyThreadMessage,
  byExternalId: Map<string, TechnologyThreadMessage>
): string {
  let current: TechnologyThreadMessage | undefined = message;
  const visited = new Set<string>();

  while (current) {
    const parentId = getParentId(current);
    if (!parentId || parentId === current.roomId) {
      return current.externalId;
    }
    if (visited.has(parentId)) return current.externalId;
    visited.add(parentId);

    const parent = byExternalId.get(parentId);
    if (!parent) return parentId;
    current = parent;
  }

  return message.externalId;
}

export function groupIntoThreads(
  messages: TechnologyThreadMessage[]
): TechnologyThread[] {
  if (messages.length === 0) return [];

  const byExternalId = new Map(messages.map((m) => [m.externalId, m]));
  const groups = new Map<string, TechnologyThreadMessage[]>();

  for (const message of messages) {
    const rootId = findThreadRoot(message, byExternalId);
    const bucket = groups.get(rootId) ?? [];
    bucket.push(message);
    groups.set(rootId, bucket);
  }

  return [...groups.entries()]
    .map(([rootId, threadMessages]) => ({
      rootId,
      messages: threadMessages.sort(
        (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
      ),
    }))
    .filter((thread) => thread.messages.length >= 2)
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.receivedAt.getTime() ?? 0;
      const bLast = b.messages[b.messages.length - 1]?.receivedAt.getTime() ?? 0;
      return bLast - aLast;
    })
    .slice(0, MAX_THREADS);
}

function threadHasQuestion(thread: TechnologyThread): boolean {
  const root = thread.messages[0];
  if (!root) return false;
  if (distillQuestion(root.body)) return true;
  return thread.messages.some((m) => distillQuestion(m.body));
}

function buildAnswerFromReplies(thread: TechnologyThread): string {
  const replies = thread.messages
    .slice(1)
    .map((m) => plainText(m.body))
    .filter(Boolean);
  if (replies.length === 0) return "";
  return distillFaqAnswer(replies[0]);
}

function questionSourceForThread(thread: TechnologyThread): string {
  const root = thread.messages[0];
  if (!root) return "";
  if (distillQuestion(root.body)) return root.body;
  const withQuestion = thread.messages.find((m) => distillQuestion(m.body));
  return withQuestion?.body ?? root.body;
}

export function buildHeuristicTechnologyFaq(
  threads: TechnologyThread[]
): TechnologySpaceFaq {
  const entries: TechnologyFaqEntry[] = [];

  for (const thread of threads) {
    if (!threadHasQuestion(thread)) continue;

    const question = reformulateFaqQuestion(questionSourceForThread(thread));
    const answer = buildAnswerFromReplies(thread);
    if (!answer) continue;

    const links = [
      ...new Set(thread.messages.flatMap((m) => extractUrls(m.body))),
    ].slice(0, 6);

    const last = thread.messages[thread.messages.length - 1];
    entries.push({
      question,
      answer,
      links,
      threadRootId: thread.rootId,
      lastUpdated: last?.receivedAt.toISOString(),
    });

    if (entries.length >= MAX_FAQ_ENTRIES) break;
  }

  return {
    entries,
    source: "heuristic",
    threadCount: threads.length,
    messageCount: threads.reduce((sum, t) => sum + t.messages.length, 0),
  };
}

export async function summarizeTechnologyFaqWithOllama(
  spaceTitle: string,
  technologyLabel: string | null,
  threads: TechnologyThread[]
): Promise<TechnologySpaceFaq | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";
  if (!baseUrl || threads.length === 0) return null;

  const qualifying = threads.filter(threadHasQuestion).slice(0, MAX_THREADS);
  if (qualifying.length === 0) return null;

  const threadBlocks = qualifying
    .map((thread, index) => {
      const lines = thread.messages.map((m) => {
        const author = m.authorName ?? "Unknown";
        return `${author}: ${plainText(m.body).slice(0, 600)}`;
      });
      return `Thread ${index + 1}:\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const focus = technologyLabel
    ? `${technologyLabel} product and support discussions`
    : "technology, support, and GTM discussions";

  const prompt = `You are building a concise FAQ from Webex space threads for a partner team.
Focus on ${focus}. Each thread has a messy customer/partner question and one or more replies.

Rewrite each thread into a polished FAQ item. Strip filler ("quick question from a customer", names, @mentions, "ping me offline") and keep only the substance.

Example thread:
Alex: quick question from a customer re:AI Defense, do we have plans to support Oracle Cloud?
Jamie: Sriram Sunny we are scoping this to support in Q1 depending on the customers demand. Please ping me offline to provide details about the specific customer ask so that we can prioritize.

Example FAQ:
{
  "question": "Does AI Defense support Oracle Cloud?",
  "answer": "Targeting support in Q1.",
  "links": []
}

Rules:
- question: one clear FAQ-style question (Does/Is/Are/Can), max 120 chars, fix typos
- answer: one short sentence with the key fact only, max 140 chars; no names or process filler
- links: only real http(s) URLs copied from the thread

Respond in JSON only:
{
  "faqs": [
    {
      "question": "clear distilled question",
      "answer": "short direct answer",
      "links": ["https://example.com/doc"]
    }
  ]
}

Only include threads where a question was asked and someone provided an answer.
Use empty links array when no URLs appear in the thread.

Space: ${spaceTitle}
Threads:
${threadBlocks.slice(0, 12_000)}`;

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
      faqs?: Array<{
        question?: string;
        answer?: string;
        links?: string[];
      }>;
    };

    const entries = (parsed.faqs ?? [])
      .filter((item) => item.question?.trim() && item.answer?.trim())
      .map((item, index) => {
        const rawAnswer = item.answer!.trim();
        const answer =
          rawAnswer.length > 140 ? distillFaqAnswer(rawAnswer) : rawAnswer;
        return {
          question: item.question!.trim(),
          answer,
          links: (item.links ?? [])
            .filter((link) => typeof link === "string" && link.startsWith("http"))
            .slice(0, 6),
          threadRootId: qualifying[index]?.rootId,
          lastUpdated: qualifying[index]?.messages.at(-1)?.receivedAt.toISOString(),
        };
      })
      .slice(0, MAX_FAQ_ENTRIES);

    if (entries.length === 0) return null;

    return {
      entries,
      source: "ollama",
      threadCount: qualifying.length,
      messageCount: qualifying.reduce((sum, t) => sum + t.messages.length, 0),
    };
  } catch {
    return null;
  }
}

function readFaqCache(
  cache: unknown,
  messageCount: number,
  threadCount: number
): TechnologySpaceFaq | null {
  if (!cache || typeof cache !== "object") return null;
  const data = cache as TechnologyFaqCache;
  if (!data.cachedAt || !Array.isArray(data.entries)) return null;

  const age = Date.now() - new Date(data.cachedAt).getTime();
  if (age > CACHE_TTL_MS) return null;
  if ((data.faqVersion ?? 1) !== FAQ_CACHE_VERSION) return null;
  if (data.messageCount !== messageCount || data.threadCount !== threadCount) {
    return null;
  }

  return {
    entries: data.entries,
    source: data.source ?? "heuristic",
    threadCount: data.threadCount,
    messageCount: data.messageCount,
  };
}

export function technologyFaqCachePayload(
  faq: TechnologySpaceFaq
): Prisma.InputJsonValue {
  return {
    entries: faq.entries.map((entry) => ({
      question: entry.question,
      answer: entry.answer,
      links: entry.links,
      threadRootId: entry.threadRootId,
      lastUpdated: entry.lastUpdated,
    })),
    source: faq.source,
    threadCount: faq.threadCount,
    messageCount: faq.messageCount,
    cachedAt: new Date().toISOString(),
    faqVersion: FAQ_CACHE_VERSION,
  } as Prisma.InputJsonValue;
}

export async function resolveTechnologySpaceFaq(input: {
  spaceTitle: string;
  technologyLabel: string | null;
  messages: TechnologyThreadMessage[];
  cache: unknown;
  persistCache?: (cache: Prisma.InputJsonValue) => Promise<void>;
}): Promise<TechnologySpaceFaq> {
  const threads = groupIntoThreads(input.messages);
  const messageCount = input.messages.length;
  const threadCount = threads.length;

  const cached = readFaqCache(input.cache, messageCount, threadCount);
  if (cached) return cached;

  const ollama = await summarizeTechnologyFaqWithOllama(
    input.spaceTitle,
    input.technologyLabel,
    threads
  );

  const faq = ollama ?? buildHeuristicTechnologyFaq(threads);

  if (input.persistCache) {
    await input.persistCache(technologyFaqCachePayload(faq)).catch(() => undefined);
  }

  return faq;
}
