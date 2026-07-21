import type { CallHighlight } from "@/lib/heuristics/ollama-vision";
import { formatTimestamp } from "../calls/vtt";

const DEFAULT_VIDCAST_API = "https://api.vidcast.io";

export function getVidcastApiBaseUrl(): string {
  return process.env.VIDCAST_API_URL?.trim().replace(/\/$/, "") || DEFAULT_VIDCAST_API;
}

export function parseVidcastShareId(url: string): string | null {
  const match = url.match(/vidcast\.io\/share\/(?:embed\/)?([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export function isVidcastReplayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /vidcast\.io/i.test(url);
}

export function extractVidcastShareUrl(text: string): string | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = match[0].replace(/[),.]+$/g, "");
    if (parseVidcastShareId(url)) return url;
  }
  return null;
}

interface VidcastHighlightItem {
  id?: string;
  start_time_ms?: number;
  end_time_ms?: number;
  text?: string;
  description?: string | null;
}

interface VidcastHighlightsResponse {
  status?: string;
  items?: VidcastHighlightItem[];
}

interface VidcastChaptersResponse {
  status?: string;
  text?: string;
}

export interface VidcastTranscriptSegment {
  start_time_ms: number;
  end_time_ms: number;
  transcript?: string;
  speaker_name?: string | null;
}

interface VidcastTranscriptResponse {
  transcript_status?: string;
  transcript?: {
    language?: string;
    transcripts?: VidcastTranscriptSegment[];
  };
}

export interface VidcastShareContent {
  shareId: string;
  videoId?: string;
  summary: string | null;
  highlights: CallHighlight[];
  transcriptText?: string;
  transcriptSummaryInput?: string;
}

export interface VidcastTranscriptContent {
  status: string;
  segments: VidcastTranscriptSegment[];
  text: string;
  summaryInput: string;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function formatVidcastChapterSummary(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  return lines
    .map((line) => {
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
      if (!match) return `- ${line}`;
      return `- ${match[2]} (${match[1]})`;
    })
    .join("\n");
}

export function flattenVidcastTranscript(segments: VidcastTranscriptSegment[]): string {
  return segments
    .map((segment) => segment.transcript?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sampleVidcastTranscriptForSummary(
  segments: VidcastTranscriptSegment[],
  maxChars = 12_000
): string {
  if (segments.length === 0) return "";

  const totalMs = segments[segments.length - 1]?.end_time_ms ?? 0;
  if (totalMs <= 0) {
    return flattenVidcastTranscript(segments).slice(0, maxChars);
  }

  const sampleEveryMs = Math.max(30_000, Math.floor(totalMs / 24));
  const lines: string[] = [];
  let nextSampleMs = 0;

  for (const segment of segments) {
    const text = segment.transcript?.trim();
    if (!text) continue;
    if (segment.start_time_ms < nextSampleMs) continue;

    const timestamp = formatTimestamp(Math.floor(segment.start_time_ms / 1000));
    const speaker = segment.speaker_name?.trim();
    lines.push(speaker ? `[${timestamp}] ${speaker}: ${text}` : `[${timestamp}] ${text}`);
    nextSampleMs = segment.start_time_ms + sampleEveryMs;
  }

  const sampled = lines.join("\n");
  if (sampled.length >= 400) return sampled.slice(0, maxChars);

  return flattenVidcastTranscript(segments).slice(0, maxChars);
}

export function enrichHighlightsFromTranscript(
  highlights: CallHighlight[],
  segments: VidcastTranscriptSegment[]
): CallHighlight[] {
  if (highlights.length === 0 || segments.length === 0) return highlights;

  return highlights.map((highlight) => {
    const startMs = highlight.startSeconds * 1000;
    const endMs = startMs + 120_000;
    const excerpt = segments
      .filter(
        (segment) =>
          segment.end_time_ms >= startMs &&
          segment.start_time_ms <= endMs &&
          segment.transcript?.trim()
      )
      .map((segment) => segment.transcript!.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (excerpt.length < 40) return highlight;

    return {
      ...highlight,
      description: excerpt.slice(0, 280),
    };
  });
}

export async function fetchVidcastTranscript(
  accessToken: string,
  shareId: string
): Promise<VidcastTranscriptContent | null> {
  const base = getVidcastApiBaseUrl();
  const response = await fetch(`${base}/v3/transcripts/${shareId}`, {
    headers: authHeaders(accessToken),
  });

  const payload = await readJson<VidcastTranscriptResponse>(response);
  if (!payload) return null;

  const status = payload.transcript_status ?? "unknown";
  const segments = payload.transcript?.transcripts ?? [];
  const text = flattenVidcastTranscript(segments);
  if (text.length < 80) {
    return { status, segments, text, summaryInput: text };
  }

  return {
    status,
    segments,
    text,
    summaryInput: sampleVidcastTranscriptForSummary(segments),
  };
}

export function mapVidcastHighlights(items: VidcastHighlightItem[]): CallHighlight[] {
  return items
    .filter((item) => typeof item.start_time_ms === "number" && item.text?.trim())
    .map((item) => {
      const startSeconds = Math.floor((item.start_time_ms ?? 0) / 1000);
      const title = item.text!.trim();
      const description = item.description?.trim() || title;
      return {
        timestamp: formatTimestamp(startSeconds),
        startSeconds,
        title,
        description,
      };
    });
}

export async function fetchVidcastShareContent(
  accessToken: string,
  replayUrl: string
): Promise<VidcastShareContent | null> {
  const shareId = parseVidcastShareId(replayUrl);
  if (!shareId) return null;

  const base = getVidcastApiBaseUrl();
  const headers = authHeaders(accessToken);

  const [highlightsRes, chaptersRes, accessRes] = await Promise.all([
    fetch(`${base}/v1/share/${shareId}/highlights`, { headers }),
    fetch(`${base}/v1/share/${shareId}/chapters`, { headers }),
    fetch(`${base}/v1/access/shared/${shareId}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    }),
  ]);

  const highlightsPayload = await readJson<VidcastHighlightsResponse>(highlightsRes);
  const chaptersPayload = await readJson<VidcastChaptersResponse>(chaptersRes);
  const accessPayload = await readJson<{ videoId?: string }>(accessRes);

  const highlightItems =
    highlightsPayload?.status === "READY" ? (highlightsPayload.items ?? []) : [];
  let highlights = mapVidcastHighlights(highlightItems);

  const transcript = await fetchVidcastTranscript(accessToken, shareId);
  if (transcript && transcript.segments.length > 0) {
    highlights = enrichHighlightsFromTranscript(highlights, transcript.segments);
  }

  const chapterText =
    chaptersPayload?.status === "READY" ? chaptersPayload.text?.trim() ?? "" : "";
  const summary = chapterText ? formatVidcastChapterSummary(chapterText) : null;

  if (!summary && highlights.length === 0 && !transcript?.text) {
    return null;
  }

  return {
    shareId,
    videoId: accessPayload?.videoId,
    summary: summary || null,
    highlights,
    transcriptText: transcript?.text,
    transcriptSummaryInput: transcript?.summaryInput,
  };
}
