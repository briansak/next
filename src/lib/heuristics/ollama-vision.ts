import { readFile } from "node:fs/promises";

const DEFAULT_VISION_MODEL = "qwen2.5vl:7b";
const DEFAULT_TEXT_MODEL = "llama3.2:3b";

export interface CallHighlight {
  timestamp: string;
  startSeconds: number;
  title: string;
  description: string;
}

export interface CallVisionSummary {
  title: string;
  summary: string;
  themes: string[];
  actionItems: string[];
  highlights: CallHighlight[];
  source: "ollama-vision";
  model: string;
}

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

async function ollamaChat(
  messages: Array<{ role: string; content: string; images?: string[] }>,
  options: { model: string; timeoutMs: number; format?: "json" }
): Promise<{ content: string | null; error?: string }> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) return { content: null, error: "OLLAMA_BASE_URL not set" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: false,
        ...(options.format ? { format: options.format } : {}),
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as OllamaChatResponse;
    if (!response.ok || data.error) {
      return { content: null, error: data.error ?? `HTTP ${response.status}` };
    }
    return { content: data.message?.content?.trim() ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return { content: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function describeMeetingFrame(input: {
  meetingTitle: string;
  timestamp: string;
  transcriptExcerpt: string;
  imagePath: string;
  model?: string;
}): Promise<{ description: string | null; error?: string }> {
  const model =
    input.model ??
    process.env.OLLAMA_VISION_MODEL?.trim() ??
    DEFAULT_VISION_MODEL;

  const bytes = await readFile(input.imagePath);
  const image = bytes.toString("base64");

  const prompt = `Meeting: ${input.meetingTitle}
Timestamp: ${input.timestamp}
Nearby transcript: ${input.transcriptExcerpt.slice(0, 500)}

Describe what is visible in this meeting frame (slides, demo UI, people, charts).
Respond in one or two sentences. If mostly talking heads with no slide, say so.`;

  const result = await ollamaChat(
    [{ role: "user", content: prompt, images: [image] }],
    { model, timeoutMs: 120_000 }
  );

  return { description: result.content, error: result.error };
}

export async function summarizeTranscriptForHighlights(input: {
  meetingTitle: string;
  transcript: string;
  durationSeconds: number;
  model?: string;
}): Promise<{
  summary: string;
  themes: string[];
  actionItems: string[];
  highlightTimestamps: number[];
} | null> {
  const model =
    input.model ??
    process.env.OLLAMA_TEXT_MODEL?.trim() ??
    process.env.OLLAMA_MODEL?.trim() ??
    DEFAULT_TEXT_MODEL;

  const prompt = `You are summarizing an internal team meeting for people who missed it.
Meeting: ${input.meetingTitle}
Duration: ${Math.round(input.durationSeconds / 60)} minutes

Transcript (timestamped samples):
${input.transcript}

Respond in JSON only:
{
  "summary": "4-6 sentence overview",
  "themes": ["theme1", "theme2"],
  "actionItems": ["concrete follow-up 1"],
  "highlightTimestamps": [120, 480]
}

Rules for highlightTimestamps:
- Pick 4-6 moments (seconds from start) worth revisiting
- Prefer major announcements, demos, decisions, and Q&A
- Spread across the meeting; use transcript timestamps as guides`;

  const raw = await ollamaChat(
    [{ role: "user", content: prompt }],
    { model, timeoutMs: 90_000, format: "json" }
  );

  if (!raw.content) return null;

  try {
    const parsed = JSON.parse(raw.content) as {
      summary?: string;
      themes?: string[];
      actionItems?: string[];
      highlightTimestamps?: number[];
    };
    if (!parsed.summary?.trim()) return null;

    return {
      summary: parsed.summary.trim(),
      themes: (parsed.themes ?? []).filter(Boolean).slice(0, 8),
      actionItems: (parsed.actionItems ?? []).filter(Boolean).slice(0, 10),
      highlightTimestamps: (parsed.highlightTimestamps ?? [])
        .filter((value) => Number.isFinite(value) && value >= 0)
        .slice(0, 8),
    };
  } catch {
    return null;
  }
}

export async function refineHighlightsWithVision(input: {
  meetingTitle: string;
  summary: string;
  transcriptExcerpt: string;
  frames: Array<{ timestamp: string; startSeconds: number; imagePath: string }>;
  model?: string;
}): Promise<CallVisionSummary | null> {
  const model =
    input.model ??
    process.env.OLLAMA_VISION_MODEL?.trim() ??
    "qwen2.5vl:7b";

  const images: string[] = [];
  const frameLabels: string[] = [];

  for (const [index, frame] of input.frames.entries()) {
    const bytes = await readFile(frame.imagePath);
    images.push(bytes.toString("base64"));
    frameLabels.push(
      `[img-${index}] at ${frame.timestamp} (${Math.round(frame.startSeconds)}s)`
    );
  }

  const prompt = `You are creating meeting highlights from video frames and transcript context.
Meeting: ${input.meetingTitle}

Draft summary:
${input.summary}

Transcript excerpt:
${input.transcriptExcerpt.slice(0, 6000)}

Frames (each labeled):
${frameLabels.join("\n")}

For each [img-N], describe what is visible (slides, demos, speakers, charts) and whether it is highlight-worthy.

Respond in JSON only:
{
  "summary": "refined 4-6 sentence summary incorporating visual context",
  "themes": ["theme1"],
  "actionItems": ["follow-up"],
  "highlights": [
    {
      "imageIndex": 0,
      "startSeconds": 120,
      "timestamp": "02:00",
      "title": "short title",
      "description": "1-2 sentences on why this moment matters"
    }
  ]
}

Pick 4-6 highlights. imageIndex must match a provided frame. Use visual evidence when slides or demos are shown.`;

  const raw = await ollamaChat(
    [{ role: "user", content: prompt, images }],
    { model, timeoutMs: 180_000, format: "json" }
  );

  if (!raw.content) return null;

  try {
    const parsed = JSON.parse(raw.content) as {
      summary?: string;
      themes?: string[];
      actionItems?: string[];
      highlights?: Array<{
        imageIndex?: number;
        startSeconds?: number;
        timestamp?: string;
        title?: string;
        description?: string;
      }>;
    };

    if (!parsed.summary?.trim()) return null;

    const highlights: CallHighlight[] = (parsed.highlights ?? [])
      .filter((item) => item.title && item.description)
      .slice(0, 8)
      .map((item) => {
        const frame =
          typeof item.imageIndex === "number"
            ? input.frames[item.imageIndex]
            : undefined;
        const startSeconds =
          item.startSeconds ?? frame?.startSeconds ?? 0;
        return {
          timestamp:
            item.timestamp ??
            frame?.timestamp ??
            `${Math.floor(startSeconds / 60)}:${String(startSeconds % 60).padStart(2, "0")}`,
          startSeconds,
          title: item.title!.trim(),
          description: item.description!.trim(),
        };
      });

    return {
      title: input.meetingTitle,
      summary: parsed.summary.trim(),
      themes: (parsed.themes ?? []).filter(Boolean).slice(0, 8),
      actionItems: (parsed.actionItems ?? []).filter(Boolean).slice(0, 10),
      highlights,
      source: "ollama-vision",
      model,
    };
  } catch {
    return null;
  }
}
