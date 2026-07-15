/**
 * Optional Ollama integration for enhanced summaries.
 * Falls back to heuristics when Ollama is unavailable.
 */

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

export async function summarizeMeetingTranscript(
  transcript: string,
  meetingTitle: string
): Promise<OllamaSummaryResponse | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";

  if (!baseUrl || !transcript.trim()) {
    return null;
  }

  const prompt = `You are summarizing a Webex meeting transcript for a partner coverage team.
Produce a concise summary and extract concrete action items if any exist.
Respond in JSON only: { "summary": "2-4 sentences", "suggestedAction": "one next step or null", "actionItems": ["item1", "item2"] }

Meeting: ${meetingTitle}
Transcript:
${transcript.slice(0, 12_000)}`;

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
    return JSON.parse(data.response) as OllamaSummaryResponse;
  } catch {
    return null;
  }
}

export async function summarizeWithOllama(
  request: OllamaSummaryRequest
): Promise<OllamaSummaryResponse | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";

  if (!baseUrl) {
    return null;
  }

  const prompt = buildPrompt(request);

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

    if (!response.ok) {
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
