import type { CallHighlight } from "./ollama-vision";
import { summarizeTranscriptForHighlights } from "./ollama-vision";
import {
  buildHeuristicTranscriptSummary,
  meetingOllamaSummaryEnabledFromConfig,
} from "./transcript-summary";
import { formatTimestamp } from "../integrations/calls/vtt";

const TIMESTAMP_LINE_RE =
  /^\[(\d{2}):(\d{2})(?::(\d{2}))?\]\s*(?:[^:]+:\s*)?(.+)$/;

function bracketToSeconds(h: string, m: string, s?: string): number {
  if (s !== undefined) {
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  return Number(h) * 60 + Number(m);
}

function excerptNearTimestamp(summaryInput: string, targetSeconds: number): string {
  let best = "";
  let bestDelta = Infinity;

  for (const line of summaryInput.split("\n")) {
    const match = line.match(TIMESTAMP_LINE_RE);
    if (!match) continue;
    const seconds = bracketToSeconds(match[1]!, match[2]!, match[3]);
    const delta = Math.abs(seconds - targetSeconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = (match[4] ?? line).trim();
    }
  }

  if (best) return best.slice(0, 320);

  const plain = summaryInput.replace(/\[[^\]]+\]\s*/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, 320);
}

function titleFromExcerpt(excerpt: string, timestamp: string): string {
  const cleaned = excerpt.replace(/^["']|["']$/g, "").trim();
  if (!cleaned) return `Highlight at ${timestamp}`;
  const words = cleaned.split(/\s+/).slice(0, 8).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
}

function heuristicHighlightTimestamps(
  durationSeconds: number,
  count = 5
): number[] {
  if (durationSeconds <= 0) return [0];
  const picks = new Set<number>();
  picks.add(0);
  if (durationSeconds > 120) {
    picks.add(Math.floor(durationSeconds * 0.25));
    picks.add(Math.floor(durationSeconds * 0.5));
    picks.add(Math.floor(durationSeconds * 0.75));
  }
  picks.add(Math.max(0, durationSeconds - 30));
  return [...picks].slice(0, count).sort((a, b) => a - b);
}

function buildHighlightsFromTimestamps(
  timestamps: number[],
  summaryInput: string
): CallHighlight[] {
  return timestamps.map((startSeconds) => {
    const timestamp = formatTimestamp(startSeconds);
    const excerpt = excerptNearTimestamp(summaryInput, startSeconds);
    return {
      timestamp,
      startSeconds,
      title: titleFromExcerpt(excerpt, timestamp),
      description: excerpt || `Discussion around ${timestamp}.`,
    };
  });
}

export async function buildMeetingHighlights(input: {
  meetingTitle: string;
  summaryInput: string;
  durationSeconds: number;
  userId?: string;
}): Promise<CallHighlight[]> {
  const { meetingTitle, summaryInput, durationSeconds, userId } = input;
  if (!summaryInput.trim()) return [];

  const appConfig = userId
    ? await (await import("@/lib/config/app-config-store")).getAppConfig(userId)
    : null;
  const meetingOllamaEnabled = appConfig
    ? meetingOllamaSummaryEnabledFromConfig(appConfig)
    : false;

  if (meetingOllamaEnabled) {
    const draft = await summarizeTranscriptForHighlights({
      meetingTitle,
      transcript: summaryInput,
      durationSeconds,
    });
    if (draft?.highlightTimestamps?.length) {
      return buildHighlightsFromTimestamps(
        draft.highlightTimestamps,
        summaryInput
      );
    }
  }

  return buildHighlightsFromTimestamps(
    heuristicHighlightTimestamps(durationSeconds),
    summaryInput
  );
}

export function estimateDurationFromSummaryInput(summaryInput: string): number {
  let maxSeconds = 0;
  for (const line of summaryInput.split("\n")) {
    const match = line.match(TIMESTAMP_LINE_RE);
    if (!match) continue;
    maxSeconds = Math.max(
      maxSeconds,
      bracketToSeconds(match[1]!, match[2]!, match[3])
    );
  }
  return maxSeconds;
}
