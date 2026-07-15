import type { ParsedEml } from "@/lib/integrations/email/eml";
import type { EmailMessage } from "@/lib/integrations/email/allowlist";
import { classifyInternalCall } from "../gong/internal-calls";

type ReplayEmailInput = ParsedEml | EmailMessage;

export interface ReplayEmailContent {
  messageId: string;
  meetingTitle: string;
  subject: string;
  summary: string;
  replayUrl: string | null;
  replayPlatform: string | null;
  receivedAt: Date;
  fromAddress: string;
  bodyText: string;
}

const REPLAY_SUBJECT_PATTERNS = [
  /^replay:\s*(.+)$/i,
  /^recording:\s*(.+)$/i,
  /^watch:\s*(.+)$/i,
];

const REPLAY_PLATFORM_RULES: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "gong", pattern: /gong\.io/i },
  { platform: "webex", pattern: /webex\.com/i },
  { platform: "zoom", pattern: /zoom\.us/i },
  { platform: "stream", pattern: /stream\.microsoft/i },
  { platform: "sharepoint", pattern: /sharepoint\.com/i },
  { platform: "youtube", pattern: /youtube\.com|youtu\.be/i },
  { platform: "vimeo", pattern: /vimeo\.com/i },
];

export function isReplayNotificationEmail(subject: string, body: string): boolean {
  const trimmedSubject = subject.trim();
  if (REPLAY_SUBJECT_PATTERNS.some((pattern) => pattern.test(trimmedSubject))) {
    return true;
  }

  const text = `${subject}\n${stripHtml(body)}`;
  return /\b(?:watch|catch|check out) the replay\b|\bview (?:the )?recording\b|\brecording is (?:now )?available\b|\bcatch up on\b|\breplay on the bridge\b|\bmark your calendar for the next session\b/i.test(
    text
  );
}

export function extractReplayTitleFromSubject(subject: string): string {
  const trimmed = subject.trim();
  for (const pattern of REPLAY_SUBJECT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return trimmed;
}

export function detectReplayPlatform(url: string): string | null {
  for (const rule of REPLAY_PLATFORM_RULES) {
    if (rule.pattern.test(url)) return rule.platform;
  }
  return null;
}

export function extractReplayUrl(htmlOrText: string): string | null {
  const anchorLinks = extractReplayLinksFromHtml(htmlOrText);
  const plainUrls = extractUrls(htmlOrText);

  const candidates = [...anchorLinks, ...plainUrls];
  const scored = candidates
    .map((url) => ({ url: sanitizeUrl(url), score: scoreReplayUrl(url, htmlOrText) }))
    .filter((entry) => entry.url && entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url ?? null;
}

export function extractReplayEmailSummary(body: string, subject: string): string {
  const plain = stripHtml(body);
  const structured = extractStructuredReplaySummary(plain);
  if (structured) {
    return structured.slice(0, 4000);
  }

  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isBoilerplateLine(line));

  const paragraphs = lines
    .filter((line) => line.length >= 40 && !/^https?:\/\//i.test(line))
    .slice(0, 6);

  if (paragraphs.length > 0) {
    return paragraphs.join(" ").slice(0, 4000);
  }

  const withoutUrls = plain.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  if (withoutUrls.length >= 40) {
    return withoutUrls.slice(0, 4000);
  }

  return extractReplayTitleFromSubject(subject);
}

export function parseReplayEmail(parsed: ReplayEmailInput): ReplayEmailContent | null {
  if (!isReplayNotificationEmail(parsed.subject, parsed.body)) {
    return null;
  }

  const bodyText = stripHtml(parsed.body);
  const meetingTitle = extractReplayTitleFromSubject(parsed.subject);
  const classification = classifyInternalCall(
    meetingTitle,
    parsed.subject,
    bodyText
  );
  if (!classification) return null;
  const replayUrl = extractReplayUrl(parsed.body);
  const summary = extractReplayEmailSummary(parsed.body, parsed.subject);

  if (!replayUrl && summary.length < 20) return null;

  return {
    messageId: parsed.messageId,
    meetingTitle,
    subject: parsed.subject,
    summary,
    replayUrl,
    replayPlatform: replayUrl ? detectReplayPlatform(replayUrl) : null,
    receivedAt: parsed.receivedAt,
    fromAddress: parsed.fromAddress,
    bodyText,
  };
}

function extractReplayLinksFromHtml(html: string): string[] {
  const links: string[] = [];
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null = anchorRe.exec(html);
  while (match) {
    const url = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/watch|replay|view|recording|play|catch up|bridge/i.test(text)) {
      links.push(url);
    }
    match = anchorRe.exec(html);
  }
  return links;
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
}

function sanitizeUrl(url: string): string {
  return url.replace(/[),.]+$/, "").trim();
}

function scoreReplayUrl(url: string, context: string): number {
  const clean = sanitizeUrl(url);
  if (!clean) return 0;

  let score = 0;
  const platform = detectReplayPlatform(clean);
  if (platform) score += 5;
  if (/\/(replay|recording|recordings|watch|play|video|calls?)\b/i.test(clean)) {
    score += 4;
  }
  if (/watch|replay|recording|play/i.test(context) && context.includes(clean)) {
    score += 2;
  }
  if (platform === "sharepoint" && /bridge|replay/i.test(context)) score += 3;
  if (/unsubscribe|privacy|preferences|tracking/i.test(clean)) score -= 10;
  return score;
}

function extractStructuredReplaySummary(plain: string): string | null {
  if (!/what['']?s the story\??/i.test(plain) || !/a closer look:?/i.test(plain)) {
    return null;
  }

  const intro = plain.match(/^([\s\S]+?)(?=what['']?s the story)/i)?.[1]?.trim();
  const story = plain
    .match(/what['']?s the story\??\s*([\s\S]+?)(?=a closer look|what['']?s next|$)/i)?.[1]
    ?.trim();
  const closer = plain
    .match(/a closer look:?\s*([\s\S]+?)(?=what['']?s next|check out the replay|$)/i)?.[1]
    ?.trim();
  const next = plain
    .match(
      /what['']?s next\??\s*([\s\S]+?)(?=check out the replay on the bridge|check out the replay|$)/i
    )?.[1]
    ?.trim();

  const parts: string[] = [];
  if (intro && intro.length >= 12) parts.push(intro);
  if (story) parts.push(`What's the story? ${story}`);
  if (closer) parts.push(`A closer look: ${closer}`);
  if (next) parts.push(`What's next? ${next}`);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

function isBoilerplateLine(line: string): boolean {
  return (
    /^unsubscribe/i.test(line) ||
    /^view in browser/i.test(line) ||
    /^copyright/i.test(line) ||
    /^https?:\/\//i.test(line) ||
    /^check out the replay/i.test(line) ||
    /^(hi|hello|dear)\b/i.test(line)
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isDirectMediaReplayUrl(url: string): boolean {
  return /\.(mp4|m4a|mp3|wav|webm)(\?|$)/i.test(url);
}
