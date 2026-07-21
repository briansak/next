import { extractTranscriptActionItems } from "./meeting-transcript";
import type { MentionUser } from "./mentions";

export interface TranscriptHeuristicSummary {
  text: string;
  themes: string[];
  actionItems: string[];
}

const FILLER_RE =
  /^(okay|ok|thanks|thank you|hello|hi|hey|alright|good morning|good afternoon|yes|yeah|cool|great)\b/i;

const THEME_KEYWORDS: Array<{ theme: string; pattern: RegExp }> = [
  { theme: "program updates", pattern: /\b(program|fire\s?jumper|black belt|mindtickle)\b/i },
  { theme: "security", pattern: /\b(security|firewall|secure networking|nfr|sku)\b/i },
  { theme: "partner updates", pattern: /\b(partner|wwt|pbi|customer)\b/i },
  { theme: "demos", pattern: /\b(demo|walkthrough|show|screen share)\b/i },
  { theme: "planning", pattern: /\b(roadmap|timeline|schedule|next week|deadline)\b/i },
];

const CUE_PREFIX_RE =
  /^(?:\[\d{2}:\d{2}(?::\d{2})?\]\s*)?(?:[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,3}:\s*)?/;

function stripCuePrefix(line: string): string {
  return line.replace(CUE_PREFIX_RE, "").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => stripCuePrefix(sentence.replace(/\s+/g, " ").trim()))
    .filter((sentence) => sentence.length >= 20);
}

function isSubstantive(sentence: string): boolean {
  if (FILLER_RE.test(sentence)) return false;
  if (sentence.length < 40) return false;
  return true;
}

function pickOverviewSentences(transcript: string, max = 4): string[] {
  const sentences = splitSentences(transcript).filter(isSubstantive);
  if (sentences.length === 0) {
    const fallback = transcript.replace(/\s+/g, " ").trim();
    return fallback ? [fallback.slice(0, 280)] : [];
  }

  if (sentences.length <= max) return sentences;

  const picks = new Set<string>();
  picks.add(sentences[0]!);
  if (sentences.length > 2) {
    picks.add(sentences[Math.floor(sentences.length / 3)]!);
    picks.add(sentences[Math.floor((2 * sentences.length) / 3)]!);
  }
  picks.add(sentences[sentences.length - 1]!);

  return [...picks].slice(0, max);
}

function detectThemes(transcript: string): string[] {
  const themes = new Set<string>();
  for (const { theme, pattern } of THEME_KEYWORDS) {
    if (pattern.test(transcript)) themes.add(theme);
  }
  return [...themes].slice(0, 5);
}

export function buildHeuristicTranscriptSummary(
  meetingTitle: string,
  transcript: string,
  options?: {
    teamMembers?: MentionUser[];
    viewerId?: string;
    actionItems?: string[];
  }
): TranscriptHeuristicSummary {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      text: `No transcript content available for ${meetingTitle}.`,
      themes: [],
      actionItems: [],
    };
  }

  const extracted =
    options?.teamMembers && options.teamMembers.length > 0
      ? extractTranscriptActionItems(
          normalized,
          options.teamMembers,
          options.viewerId
        ).map((item) => item.title)
      : [];

  const actionItems = [...new Set([...(options?.actionItems ?? []), ...extracted])]
    .filter(Boolean)
    .slice(0, 5);

  const overview = pickOverviewSentences(normalized);
  const themes = detectThemes(normalized);

  let text = overview.join(" ");
  if (text.length > 420) {
    text = `${text.slice(0, 417)}…`;
  }

  if (actionItems.length > 0) {
    const actionPhrase =
      actionItems.length === 1
        ? `Next step: ${actionItems[0]}.`
        : `Key follow-ups: ${actionItems.slice(0, 3).join("; ")}.`;
    text = `${text} ${actionPhrase}`.trim();
  }

  if (text.length < 80 && overview.length > 0) {
    text = overview.join(" ").slice(0, 500);
  }

  return {
    text: text.trim(),
    themes,
    actionItems,
  };
}

export function meetingOllamaSummaryEnabled(): boolean {
  return (
    process.env.ENABLE_MEETING_OLLAMA_SUMMARY === "true" &&
    Boolean(process.env.OLLAMA_BASE_URL?.trim())
  );
}

export function meetingOllamaSummaryEnabledFromConfig(config: {
  enableMeetingOllamaSummary: boolean;
  ollamaBaseUrl: string | null;
}): boolean {
  return config.enableMeetingOllamaSummary && Boolean(config.ollamaBaseUrl);
}
