/** Parse Webex VTT or plain-text transcript downloads. */
export function parseTranscriptContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("WEBVTT")) {
    return parseVtt(trimmed);
  }

  return normalizeWhitespace(trimmed);
}

function parseVtt(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const spoken: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "WEBVTT" || t.startsWith("NOTE") || t.includes("-->")) continue;
    if (/^\d+$/.test(t)) continue;
    spoken.push(t);
  }

  return normalizeWhitespace(spoken.join(" "));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncateForSummary(text: string, maxChars = 12_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}
