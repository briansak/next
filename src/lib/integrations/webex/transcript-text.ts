import {
  parseWebVtt,
  sampleTranscriptForSummary,
} from "../calls/vtt";

export interface ParsedTranscript {
  /** Full spoken text for storage and display. */
  text: string;
  /** Sampled, speaker-aware text optimized for summarization. */
  summaryInput: string;
}

/** Parse Webex VTT or plain-text transcript downloads. */
export function parseTranscriptContent(raw: string): string {
  return parseTranscriptParts(raw).text;
}

/** Parse transcript into display text and summary-optimized input. */
export function parseTranscriptParts(raw: string): ParsedTranscript {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "", summaryInput: "" };
  }

  if (trimmed.startsWith("WEBVTT")) {
    const cues = parseWebVtt(trimmed);
    const text = normalizeWhitespace(cues.map((cue) => cue.text).join(" "));
    const summaryInput = sampleTranscriptForSummary(cues);
    return { text, summaryInput: summaryInput || text };
  }

  const text = normalizeWhitespace(trimmed);
  return { text, summaryInput: truncateForSummary(text) };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncateForSummary(text: string, maxChars = 12_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}
