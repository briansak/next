export interface VttCue {
  index: number;
  speaker: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

const TIMESTAMP_RE =
  /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

function parseTimestamp(
  hours: string,
  minutes: string,
  seconds: string,
  millis: string
): number {
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis) / 1000
  );
}

function parseSpeakerLine(line: string): string | null {
  const match = line.match(/^\d+\s+"([^"]+)"/);
  return match?.[1] ?? null;
}

export function parseWebVtt(content: string): VttCue[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const cues: VttCue[] = [];
  let i = 0;

  while (i < lines.length && !lines[i]?.includes("-->")) {
    i += 1;
  }

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";
    if (!line.includes("-->")) {
      i += 1;
      continue;
    }

    const tsMatch = line.match(TIMESTAMP_RE);
    if (!tsMatch) {
      i += 1;
      continue;
    }

    const startSeconds = parseTimestamp(
      tsMatch[1],
      tsMatch[2],
      tsMatch[3],
      tsMatch[4]
    );
    const endSeconds = parseTimestamp(
      tsMatch[5],
      tsMatch[6],
      tsMatch[7],
      tsMatch[8]
    );

    let speaker: string | null = null;
    const prev = lines[i - 1]?.trim() ?? "";
    if (prev && !prev.includes("-->") && prev !== "WEBVTT") {
      speaker = parseSpeakerLine(prev);
    }

    i += 1;
    const textLines: string[] = [];
    while (i < lines.length) {
      const textLine = lines[i]?.trim() ?? "";
      if (!textLine) break;
      if (textLine.includes("-->")) break;
      if (/^\d+$/.test(textLine) && lines[i + 1]?.includes("-->")) break;
      textLines.push(textLine);
      i += 1;
    }

    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      cues.push({
        index: cues.length + 1,
        speaker,
        startSeconds,
        endSeconds,
        text,
      });
    }

    while (i < lines.length && !lines[i]?.trim()) {
      i += 1;
    }
  }

  return cues;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Sample transcript for LLM context without sending every cue. */
export function sampleTranscriptForSummary(
  cues: VttCue[],
  maxChars = 14_000
): string {
  if (cues.length === 0) return "";

  const pickEvery = Math.max(1, Math.floor(cues.length / 80));
  const sampled = cues.filter((_, index) => index % pickEvery === 0);

  const lines = sampled.map(
    (cue) =>
      `[${formatTimestamp(cue.startSeconds)}] ${cue.speaker ? `${cue.speaker}: ` : ""}${cue.text}`
  );

  let transcript = lines.join("\n");
  if (transcript.length > maxChars) {
    transcript = transcript.slice(0, maxChars);
  }
  return transcript;
}

export function transcriptDurationSeconds(cues: VttCue[]): number {
  if (cues.length === 0) return 0;
  return cues[cues.length - 1]?.endSeconds ?? 0;
}

/** Pull spoken content near a timestamp for highlight cards. */
export function transcriptExcerptAt(
  cues: VttCue[],
  seconds: number,
  windowSeconds = 45
): string {
  const relevant = cues.filter(
    (cue) =>
      cue.startSeconds >= seconds - windowSeconds &&
      cue.startSeconds <= seconds + windowSeconds
  );
  return relevant
    .map((cue) => cue.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

export function speakersNear(
  cues: VttCue[],
  seconds: number,
  windowSeconds = 45
): string[] {
  const names = new Set<string>();
  for (const cue of cues) {
    if (
      cue.speaker &&
      cue.startSeconds >= seconds - windowSeconds &&
      cue.startSeconds <= seconds + windowSeconds
    ) {
      names.add(cue.speaker);
    }
  }
  return [...names];
}
