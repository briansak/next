import type { ParsedEml } from "@/lib/integrations/email/eml";
import type { EmailMessage } from "@/lib/integrations/email/allowlist";
import { normalizeEmailBodyText } from "../../integrations/email/body-text";
import { distillEmailDigest } from "../../heuristics/email-digest-summary";
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
  { platform: "cisco", pattern: /campaignmgr\.cisco\.com/i },
  { platform: "vidcast", pattern: /vidcast\.io/i },
  { platform: "youtube", pattern: /youtube\.com|youtu\.be/i },
  { platform: "vimeo", pattern: /vimeo\.com/i },
];

export function isReplayNotificationEmail(subject: string, body: string): boolean {
  const trimmedSubject = subject.trim();
  if (REPLAY_SUBJECT_PATTERNS.some((pattern) => pattern.test(trimmedSubject))) {
    return true;
  }

  const text = `${subject}\n${normalizeEmailBodyText(body)}`;
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
  const contextualPlainLinks = extractReplayLinksFromPlainText(htmlOrText);
  const plainUrls = extractUrls(htmlOrText);

  const candidates = [...anchorLinks, ...contextualPlainLinks, ...plainUrls];
  const scored = candidates
    .map((url) => ({ url: sanitizeUrl(url), score: scoreReplayUrl(url, htmlOrText) }))
    .filter((entry) => entry.url && entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url ?? null;
}

export function extractReplayEmailSummary(body: string, subject: string): string {
  const plain = normalizeEmailBodyText(body);
  const structured = extractStructuredReplaySummary(plain);
  if (structured) {
    return structured.slice(0, 4000);
  }

  const digest = distillEmailDigest(subject, plain);
  if (digest) {
    return digest.slice(0, 4000);
  }

  const substantive = extractSubstantiveParagraphs(plain);
  if (substantive.length > 0) {
    return substantive.join("\n\n").slice(0, 4000);
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

  const bodyText = normalizeEmailBodyText(parsed.body);
  const meetingTitle = extractReplayTitleFromSubject(parsed.subject);
  const classification = classifyInternalCall(
    meetingTitle,
    parsed.subject,
    bodyText
  );
  if (!classification) return null;
  const replayUrl = extractReplayUrl(normalizeEmailBodyText(parsed.body) + "\n" + parsed.body);
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
    const start = Math.max(0, match.index - 220);
    const end = Math.min(html.length, match.index + match[0].length + 220);
    const surrounding = html.slice(start, end);
    if (isReplayAnchorLink(url, text, surrounding)) {
      links.push(url);
    }
    match = anchorRe.exec(html);
  }
  return links;
}

const REPLAY_CONTEXT_RE =
  /\b(?:watch(?:\s+the)?\s+(?:replay|recording)|view(?:\s+the)?\s+recording|catch(?:\s+the)?\s+replay|check out the replay|replay on the bridge|on the bridge|recording is (?:now )?available)\b/i;

function isGenericReplayLinkText(text: string): boolean {
  const trimmed = text.trim();
  return (
    /^(?:click\s+)?here\.?$/i.test(trimmed) ||
    /^this\s+link\.?$/i.test(trimmed) ||
    /^the\s+replay\.?$/i.test(trimmed) ||
    /^watch(?:\s+now)?\.?$/i.test(trimmed) ||
    /^play(?:\s+now)?\.?$/i.test(trimmed) ||
    /^link\.?$/i.test(trimmed)
  );
}

function isReplayAnchorLink(url: string, linkText: string, surroundingHtml: string): boolean {
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl || /^mailto:|^#/i.test(cleanUrl)) return false;
  if (/unsubscribe|privacy|preferences|view in browser|online version/i.test(cleanUrl)) {
    return false;
  }

  const context = surroundingHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/watch|replay|view|recording|play|catch up|bridge/i.test(linkText)) {
    return true;
  }

  if (/click\s+here/i.test(linkText) && REPLAY_CONTEXT_RE.test(context)) {
    return true;
  }

  if (isGenericReplayLinkText(linkText) && REPLAY_CONTEXT_RE.test(context)) {
    return true;
  }

  return false;
}

function extractReplayLinksFromPlainText(text: string): string[] {
  const links: string[] = [];
  const plain = text.replace(/<[^>]+>/g, " ");

  const inlinePatterns = [
    /\bwatch(?:\s+the)?\s+replay(?:\s+on\s+the\s+bridge)?\s+here\s*(?:[:.]?\s*)?(?:<\s*)?(https?:\/\/[^\s<>")]+)/gi,
    /\b(?:catch|check out)(?:\s+the)?\s+replay(?:\s+on\s+the\s+bridge)?\s*(?:[:.]?\s*)?(?:<\s*)?(https?:\/\/[^\s<>")]+)/gi,
    /\bview(?:\s+the)?\s+recording\s+here\s*(?:[:.]?\s*)?(?:<\s*)?(https?:\/\/[^\s<>")]+)/gi,
  ];

  for (const pattern of inlinePatterns) {
    for (const match of plain.matchAll(pattern)) {
      if (match[1]) links.push(match[1]);
    }
  }

  for (const match of plain.matchAll(/\bhere\s+(https?:\/\/\S+)/gi)) {
    const index = match.index ?? 0;
    const before = plain.slice(Math.max(0, index - 120), index);
    if (REPLAY_CONTEXT_RE.test(before) || /\bwatch\b[^\n]{0,40}\bhere\b/i.test(before + match[0])) {
      links.push(match[1].replace(/[),.]+$/, ""));
    }
  }

  for (const match of plain.matchAll(/\b(?:click|watch|view)\s+here\s+(https?:\/\/\S+)/gi)) {
    links.push(match[1].replace(/[),.]+$/, ""));
  }

  return links;
}

function extractUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    urls.add(match[0]);
  }
  for (const match of text.matchAll(/<\s*(https?:\/\/[^>]+)>/gi)) {
    urls.add(match[1]);
  }
  for (const match of text.matchAll(/href=["']([^"']+)["']/gi)) {
    urls.add(match[1]);
  }
  return [...urls];
}

function sanitizeUrl(url: string): string {
  return url.replace(/^[<\[\(]+|[>\]\),.;]+$/g, "").trim();
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
  const contextNearUrl = extractContextAroundUrl(context, clean, 120);
  if (/watch the replay|watch the recording|view the replay|catch the replay/i.test(contextNearUrl)) {
    score += 6;
  } else if (/watch(?:\s+the)?\s+replay\s+here|replay\s+here/i.test(contextNearUrl)) {
    score += 5;
  } else if (/watch|replay|recording|play/i.test(contextNearUrl)) {
    score += 2;
  }
  if (/en25\.com|\.eloqua\.|elqTrackId/i.test(clean)) score -= 8;
  if (/unsubscribe|privacy|preferences|tracking/i.test(clean)) score -= 10;
  if (platform === "sharepoint" && /bridge|replay/i.test(context)) score += 3;
  return score;
}

function extractContextAroundUrl(context: string, url: string, radius: number): string {
  const clean = sanitizeUrl(url);
  let index = context.indexOf(clean);
  if (index < 0 && clean.length > 48) {
    index = context.indexOf(clean.slice(0, 48));
  }
  if (index < 0) return "";
  const start = Math.max(0, index - radius);
  const end = Math.min(context.length, index + clean.length + radius);
  return context.slice(start, end);
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

function extractSubstantiveParagraphs(plain: string): string[] {
  return plain
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 60)
    .filter((paragraph) => !isBoilerplateLine(paragraph))
    .filter((paragraph) => !/^https?:\/\//i.test(paragraph))
    .filter(
      (paragraph) =>
        /\b(focused|introduced|discussed|covered|customers?|partners?|replay|session|town hall|ai-era|cyber|defense|resources)\b/i.test(
          paragraph
        )
    )
    .slice(0, 4);
}

function isBoilerplateLine(line: string): boolean {
  return (
    /^unsubscribe/i.test(line) ||
    /^view in browser/i.test(line) ||
    /^if you have trouble viewing/i.test(line) ||
    /^read the online version/i.test(line) ||
    /^copyright/i.test(line) ||
    /^https?:\/\//i.test(line) ||
    /^check out the replay/i.test(line) ||
    /^here(?:'|’)s your next step/i.test(line) ||
    /^sign up for/i.test(line) ||
    /^global sales communications/i.test(line) ||
    /^additional resources referenced/i.test(line) ||
    /^(hi|hello|dear)\b/i.test(line) ||
    /campaignmgr\.cisco\.com/i.test(line) ||
    /\.eloqua\.com/i.test(line)
  );
}

function stripHtml(html: string): string {
  return normalizeEmailBodyText(html);
}

export function isDirectMediaReplayUrl(url: string): boolean {
  return /\.(mp4|m4a|mp3|wav|webm)(\?|$)/i.test(url);
}
