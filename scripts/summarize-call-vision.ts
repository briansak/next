/**
 * Summarize a local meeting replay (MP4 + VTT) using Ollama:
 * 1. Text model on transcript → draft summary + highlight timestamps
 * 2. ffmpeg frame grabs at those timestamps
 * 3. qwen2.5vl vision → refined summary + visual highlights
 *
 * Usage:
 *   npx tsx scripts/summarize-call-vision.ts calls/"Weekly Securions Team Meeting-20260615 2104-1.mp4"
 *   npx tsx scripts/summarize-call-vision.ts calls/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  formatTimestamp,
  parseWebVtt,
  sampleTranscriptForSummary,
  speakersNear,
  transcriptDurationSeconds,
  transcriptExcerptAt,
  type VttCue,
} from "../src/lib/integrations/calls/vtt";
import {
  describeMeetingFrame,
  refineHighlightsWithVision,
  summarizeTranscriptForHighlights,
  type CallHighlight,
  type CallVisionSummary,
} from "../src/lib/heuristics/ollama-vision";

const execFileAsync = promisify(execFile);

const FFMPEG =
  process.env.FFMPEG_BIN?.trim() || "/opt/homebrew/bin/ffmpeg";

function stem(path: string): string {
  return basename(path, extname(path));
}

async function resolveMediaPair(inputPath: string): Promise<{
  mp4: string;
  vtt: string;
  title: string;
}> {
  const abs = resolve(inputPath);
  if (abs.endsWith(".mp4")) {
    const base = stem(abs);
    return {
      mp4: abs,
      vtt: join(dirname(abs), `${base}.vtt`),
      title: base,
    };
  }

  const mp4 = join(abs, `${basename(abs)}.mp4`);
  return {
    mp4,
    vtt: join(abs, `${basename(abs)}.vtt`),
    title: basename(abs),
  };
}

async function extractFrame(
  mp4: string,
  startSeconds: number,
  outputPath: string
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await execFileAsync(FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(startSeconds),
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-vf",
    "scale=768:-1",
    "-q:v",
    "3",
    "-y",
    outputPath,
  ]);
}

function highlightTimestamps(
  candidates: number[],
  durationSeconds: number,
  maxFrames: number
): number[] {
  const unique = [...new Set(candidates)]
    .filter((value) => value >= 0 && value <= durationSeconds)
    .sort((a, b) => a - b);

  if (unique.length >= maxFrames) {
    return unique.slice(0, maxFrames);
  }

  const padded = [...unique];
  const step = durationSeconds / (maxFrames + 1);
  for (let index = 1; padded.length < maxFrames; index += 1) {
    padded.push(Math.round(step * index));
  }

  return [...new Set(padded)]
    .sort((a, b) => a - b)
    .slice(0, maxFrames);
}

function buildTranscriptHighlights(
  cues: VttCue[],
  timestamps: number[],
  frameDescriptions: Map<number, string>
): CallHighlight[] {
  return timestamps.map((startSeconds) => {
    const excerpt = transcriptExcerptAt(cues, startSeconds);
    const speakers = speakersNear(cues, startSeconds);
    const visual = frameDescriptions.get(startSeconds);
    const title =
      speakers.length > 0
        ? `${speakers.slice(0, 2).join(" & ")} — ${formatTimestamp(startSeconds)}`
        : `Discussion at ${formatTimestamp(startSeconds)}`;

    const description = visual
      ? `${excerpt} Visual: ${visual}`
      : excerpt || "Key discussion point from transcript.";

    return {
      timestamp: formatTimestamp(startSeconds),
      startSeconds,
      title,
      description,
    };
  });
}

async function describeFramesSequentially(input: {
  meetingTitle: string;
  cues: VttCue[];
  frames: Array<{ timestamp: string; startSeconds: number; imagePath: string }>;
}): Promise<Map<number, string>> {
  const descriptions = new Map<number, string>();

  for (const frame of input.frames) {
    console.log(`Vision pass: ${frame.timestamp}…`);
    const result = await describeMeetingFrame({
      meetingTitle: input.meetingTitle,
      timestamp: frame.timestamp,
      transcriptExcerpt: transcriptExcerptAt(input.cues, frame.startSeconds),
      imagePath: frame.imagePath,
    });

    if (result.description) {
      descriptions.set(frame.startSeconds, result.description);
      console.log(`  → ${result.description.slice(0, 100)}…`);
    } else {
      console.warn(`  → vision failed: ${result.error ?? "unknown"}`);
    }
  }

  return descriptions;
}

async function summarizeCall(inputPath: string): Promise<CallVisionSummary> {
  const { mp4, vtt, title } = await resolveMediaPair(inputPath);
  const vttContent = await readFile(vtt, "utf8");
  const cues = parseWebVtt(vttContent);
  const durationSeconds = transcriptDurationSeconds(cues);
  const transcript = sampleTranscriptForSummary(cues);

  console.log(`Meeting: ${title}`);
  console.log(`Duration: ${formatTimestamp(durationSeconds)} (${cues.length} cues)`);
  console.log(`Transcript sample: ${transcript.length} chars`);

  const draft = await summarizeTranscriptForHighlights({
    meetingTitle: title,
    transcript,
    durationSeconds,
  });

  if (!draft) {
    throw new Error(
      "Text summarization failed. Check OLLAMA_BASE_URL and text model availability."
    );
  }

  console.log("\nDraft summary (text model):");
  console.log(draft.summary);
  console.log("Candidate highlight timestamps:", draft.highlightTimestamps);

  const frameDir = join(dirname(mp4), ".frames", stem(mp4));
  const timestamps = highlightTimestamps(
    draft.highlightTimestamps,
    durationSeconds,
    6
  );

  const frames: Array<{
    timestamp: string;
    startSeconds: number;
    imagePath: string;
  }> = [];

  for (const startSeconds of timestamps) {
    const label = formatTimestamp(startSeconds).replace(/:/g, "-");
    const imagePath = join(frameDir, `${label}.jpg`);
    console.log(`Extracting frame at ${formatTimestamp(startSeconds)}…`);
    await extractFrame(mp4, startSeconds, imagePath);
    frames.push({
      timestamp: formatTimestamp(startSeconds),
      startSeconds,
      imagePath,
    });
  }

  console.log(`\nSending ${frames.length} frames to vision model (sequential)…`);

  const frameDescriptions = await describeFramesSequentially({
    meetingTitle: title,
    cues,
    frames,
  });

  let vision: CallVisionSummary | null = null;
  if (frameDescriptions.size >= 2) {
    console.log("\nRefining highlights with batch vision + transcript…");
    vision = await refineHighlightsWithVision({
      meetingTitle: title,
      summary: draft.summary,
      transcriptExcerpt: transcript,
      frames: frames.filter((frame) => frameDescriptions.has(frame.startSeconds)),
    });
  }

  if (!vision) {
    if (frameDescriptions.size === 0) {
      console.warn(
        "Vision model unavailable (Ollama returned runner killed / OOM?). Using transcript-only highlights."
      );
    } else {
      console.warn("Batch vision refinement skipped — using per-frame descriptions.");
    }

    return {
      title,
      summary: draft.summary,
      themes: draft.themes,
      actionItems: draft.actionItems,
      highlights: buildTranscriptHighlights(cues, timestamps, frameDescriptions),
      source: "ollama-vision",
      model:
        frameDescriptions.size > 0
          ? (process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:7b")
          : (process.env.OLLAMA_TEXT_MODEL ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b"),
    };
  }

  return vision;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2] ?? "calls";
  const absInput = resolve(inputPath);

  let mediaPath = absInput;
  if (!absInput.endsWith(".mp4")) {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(absInput);
    const mp4 = files.find((file) => file.endsWith(".mp4"));
    if (!mp4) {
      throw new Error(`No .mp4 found in ${absInput}`);
    }
    mediaPath = join(absInput, mp4);
  }

  if (!process.env.OLLAMA_BASE_URL?.trim()) {
    throw new Error("Set OLLAMA_BASE_URL in .env or environment.");
  }

  console.log("OLLAMA_BASE_URL:", process.env.OLLAMA_BASE_URL);
  console.log(
    "Vision model:",
    process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:7b"
  );

  const result = await summarizeCall(mediaPath);
  const outputPath = join(
    dirname(mediaPath),
    `${stem(mediaPath)}.highlights.json`
  );

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log("\n=== Summary ===");
  console.log(result.summary);
  console.log("\n=== Themes ===");
  for (const theme of result.themes) console.log(`- ${theme}`);
  console.log("\n=== Action items ===");
  for (const item of result.actionItems) console.log(`- ${item}`);
  console.log("\n=== Highlights ===");
  for (const highlight of result.highlights) {
    console.log(
      `- [${highlight.timestamp}] ${highlight.title}: ${highlight.description}`
    );
  }
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
