/**
 * Optional Ollama integration for enhanced summaries.
 * Falls back to heuristics when Ollama is unavailable.
 */

import type { OllamaRuntimeSettings } from "@/lib/config/app-config";

const OLLAMA_TIMEOUT_MS = 8_000;
const OLLAMA_MEETING_TIMEOUT_MS = Number(
  process.env.OLLAMA_MEETING_TIMEOUT_MS ?? 120_000
);

function resolveOllamaRuntime(runtime?: OllamaRuntimeSettings | null): {
  baseUrl: string | null;
  model: string;
} {
  const baseUrl =
    runtime?.baseUrl?.trim() || process.env.OLLAMA_BASE_URL?.trim() || null;
  const model =
    runtime?.model?.trim() || process.env.OLLAMA_MODEL?.trim() || "llama3.1:8b";
  return { baseUrl, model };
}

export async function generateOllamaJson<T>(
  prompt: string,
  options?: { timeoutMs?: number; model?: string; runtime?: OllamaRuntimeSettings | null }
): Promise<T | null> {
  const { baseUrl, model: defaultModel } = resolveOllamaRuntime(options?.runtime);
  const model = options?.model ?? defaultModel;
  if (!baseUrl) return null;

  const timeoutMs = options?.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { response: string };
    return JSON.parse(data.response) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOllama(
  url: string,
  init: RequestInit
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface OllamaSummaryRequest {
  body: string;
  subject?: string;
  context?: string;
}

export interface OllamaSummaryResponse {
  summary: string;
  suggestedAction?: string;
  tags?: string[];
  actionItems?: string[];
}

export interface VidcastTranscriptSummaryResponse {
  overview: string;
  takeaways?: string[];
  actionItems?: string[];
}

export function ollamaConfigured(runtime?: OllamaRuntimeSettings | null): boolean {
  return Boolean(resolveOllamaRuntime(runtime).baseUrl);
}

export function formatVidcastTranscriptSummary(
  response: VidcastTranscriptSummaryResponse
): string {
  const overview = response.overview?.trim() ?? "";
  const takeaways = (response.takeaways ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);

  const parts: string[] = [];
  if (overview) parts.push(overview);
  if (takeaways.length > 0) {
    parts.push(takeaways.map((item) => `- ${item}`).join("\n"));
  }

  return parts.join("\n\n").trim();
}

export async function summarizeVidcastTranscript(
  transcript: string,
  meetingTitle: string,
  runtime?: OllamaRuntimeSettings | null
): Promise<VidcastTranscriptSummaryResponse | null> {
  const { baseUrl, model } = resolveOllamaRuntime(runtime);

  if (!baseUrl || !transcript.trim()) {
    return null;
  }

  const prompt = `You are summarizing an internal company town hall or enablement session from a Vidcast transcript.
The audience missed the live session and needs a useful at-a-glance recap with enough depth to understand what was discussed, not just a headline.

Respond in JSON only:
{
  "overview": "3-5 sentences covering context, main themes, decisions, and outcomes",
  "takeaways": ["5-8 specific bullet points with concrete details — products, dates, programs, or commitments when mentioned"],
  "actionItems": ["follow-ups for the team, if any"]
}

Meeting: ${meetingTitle}
Transcript:
${transcript.slice(0, 14_000)}`;

  return generateOllamaJson<VidcastTranscriptSummaryResponse>(prompt, {
    timeoutMs: OLLAMA_MEETING_TIMEOUT_MS,
    model,
    runtime,
  });
}

export async function summarizeMeetingTranscript(
  transcript: string,
  meetingTitle: string,
  runtime?: OllamaRuntimeSettings | null
): Promise<OllamaSummaryResponse | null> {
  const { baseUrl, model } = resolveOllamaRuntime(runtime);

  if (!baseUrl || !transcript.trim()) {
    return null;
  }

  const prompt = `You are summarizing a Webex meeting transcript for a partner coverage team.
Produce a concise summary and extract concrete action items if any exist.
Respond in JSON only: { "summary": "2-4 sentences", "suggestedAction": "one next step or null", "actionItems": ["item1", "item2"] }

Meeting: ${meetingTitle}
Transcript:
${transcript.slice(0, 12_000)}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OLLAMA_MEETING_TIMEOUT_MS
  );

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
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { response: string };
    return JSON.parse(data.response) as OllamaSummaryResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeWithOllama(
  request: OllamaSummaryRequest,
  runtime?: OllamaRuntimeSettings | null
): Promise<OllamaSummaryResponse | null> {
  const { baseUrl, model } = resolveOllamaRuntime(runtime);

  if (!baseUrl) {
    return null;
  }

  const prompt = buildPrompt(request);

  try {
    const response = await fetchOllama(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response?.ok) {
      return null;
    }

    const data = (await response.json()) as { response: string };
    return JSON.parse(data.response) as OllamaSummaryResponse;
  } catch {
    return null;
  }
}

function buildPrompt(request: OllamaSummaryRequest): string {
  return `You are analyzing a team communication for a partner coverage team.
Summarize the message and suggest a next action if one is needed.
Respond in JSON: { "summary": "...", "suggestedAction": "..." or null, "tags": ["..."] }

Subject: ${request.subject ?? "(none)"}
Message:
${request.body.slice(0, 2000)}`;
}
