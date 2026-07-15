import type { ParsedEml } from "@/lib/integrations/email/eml";

export interface GongEmailContent {
  messageId: string;
  meetingTitle: string;
  summary: string;
  actionItems: string[];
  replayUrl: string | null;
  receivedAt: Date;
  fromAddress: string;
  subject: string;
}

const GONG_FROM_PATTERNS = [
  /@gong\.io$/i,
  /@mail\.gong\.io$/i,
  /@notifications\.gong\.io$/i,
];

const SUBJECT_TITLE_PATTERNS = [
  /^call recap:\s*(.+)$/i,
  /^meeting recap:\s*(.+)$/i,
  /^recap:\s*(.+)$/i,
  /^summary:\s*(.+)$/i,
  /^(.+?)\s+[-–|]\s+gong\b/i,
  /^gong\s+(?:summary|recap)\s*[-–:]\s*(.+)$/i,
  /^(.+?)\s+meeting\s+summary$/i,
  /^your\s+meeting\s+(.+?)\s+was\s+analyzed/i,
];

export function isGongEmail(
  fromAddress: string,
  subject?: string,
  body?: string
): boolean {
  const from = fromAddress.toLowerCase();
  if (GONG_FROM_PATTERNS.some((pattern) => pattern.test(from))) {
    return true;
  }
  if (from.includes("gong")) return true;

  const text = `${subject ?? ""}\n${body ?? ""}`;
  return (
    /\bgong\b/i.test(text) &&
    /\b(recap|summary|action items?|next steps?|call recording)\b/i.test(text)
  );
}

export function normalizeMeetingTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[WWT\]/gi, "")
    .replace(/^(call|meeting)\s+(recap|summary):\s*/i, "")
    .replace(/^(recap|summary):\s*/i, "")
    .replace(/\s+[-–|]\s+gong.*$/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMeetingTitleFromGongSubject(subject: string): string {
  const trimmed = subject.trim();
  for (const pattern of SUBJECT_TITLE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return trimmed;
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeMeetingTitle(a);
  const nb = normalizeMeetingTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = significantTitleTokens(na);
  const tb = significantTitleTokens(nb);
  if (ta.size === 0 || tb.size === 0) return 0;

  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const smaller = Math.min(ta.size, tb.size);
  if (intersection === smaller && smaller >= 2) return 0.88;

  const union = new Set([...ta, ...tb]).size;
  return intersection / union;
}

const TITLE_STOP_WORDS = new Set([
  "wwt",
  "weekly",
  "monthly",
  "daily",
  "biweekly",
  "recurring",
  "optional",
  "the",
  "and",
  "for",
  "with",
]);

function significantTitleTokens(normalizedTitle: string): Set<string> {
  return new Set(
    normalizedTitle
      .split(" ")
      .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word))
  );
}

export function parseGongEmail(parsed: ParsedEml): GongEmailContent | null {
  if (!isGongEmail(parsed.fromAddress, parsed.subject, parsed.body)) {
    return null;
  }

  const plainBody = stripHtml(parsed.body);
  const meetingTitle =
    extractMeetingTitleFromBody(plainBody) ??
    extractMeetingTitleFromGongSubject(parsed.subject);
  const summary = extractGongSummary(plainBody);
  const actionItems = extractGongActionItems(plainBody);
  const replayUrl = extractGongReplayUrl(plainBody);

  if (!meetingTitle && !summary) return null;

  return {
    messageId: parsed.messageId,
    meetingTitle: meetingTitle || parsed.subject,
    summary,
    actionItems,
    replayUrl,
    receivedAt: parsed.receivedAt,
    fromAddress: parsed.fromAddress,
    subject: parsed.subject,
  };
}

export function extractGongReplayUrl(body: string): string | null {
  const urls = body.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];

  for (const raw of urls) {
    const url = raw.replace(/[),.]+$/, "");
    if (!/gong\.io/i.test(url)) continue;
    if (/\/(call|recording|share|meetings)\b/i.test(url)) return url;
  }

  const fallback = urls
    .map((raw) => raw.replace(/[),.]+$/, ""))
    .find((url) => /gong\.io/i.test(url));

  return fallback ?? null;
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

function extractMeetingTitleFromBody(body: string): string | null {
  const patterns = [
    /^Meeting:\s*(.+)$/im,
    /^Call:\s*(.+)$/im,
    /^Subject:\s*(.+)$/im,
    /^Title:\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function extractGongSummary(body: string): string {
  const sectionPatterns = [
    /(?:^|\n)\s*(?:Summary|Overview|Call summary|Meeting summary)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Action items?|Next steps?|Key topics|Attendees|Participants|$))/i,
    /(?:^|\n)\s*(?:Key (?:takeaways|points|updates)|Highlights)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Action items?|Next steps?|$))/i,
  ];

  for (const pattern of sectionPatterns) {
    const match = body.match(pattern);
    if (match?.[1]?.trim()) {
      return cleanSummaryText(match[1]);
    }
  }

  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const stopIndex = lines.findIndex((line) =>
    /^(action items?|next steps?|attendees|participants|view (?:call|recording)|gong\.io)/i.test(
      line
    )
  );
  const contentLines = stopIndex >= 0 ? lines.slice(0, stopIndex) : lines.slice(0, 12);
  return cleanSummaryText(contentLines.join("\n"));
}

function extractGongActionItems(body: string): string[] {
  const items: string[] = [];
  const sectionMatch = body.match(
    /(?:^|\n)\s*(?:Action items?|Next steps?|Follow[- ]?ups?)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Summary|Attendees|View |Gong|https?:\/\/|$))/i
  );

  const section = sectionMatch?.[1] ?? body;
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const text = bullet?.[1] ?? numbered?.[1];
    if (!text || text.length < 8) continue;
    if (/^(action items?|next steps?)$/i.test(text)) continue;
    items.push(text.replace(/\s+/g, " ").trim());
  }

  return [...new Set(items)].slice(0, 12);
}

function cleanSummaryText(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .trim()
    .slice(0, 6000);
}
