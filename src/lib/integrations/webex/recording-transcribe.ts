import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { getImportAppConfig } from "@/lib/config/app-config-store";
import type { ResolvedAppConfig } from "@/lib/config/app-config";

const execFileAsync = promisify(execFile);

const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 180_000;

export async function recordingTranscriptionEnabled(): Promise<boolean> {
  const config = await getImportAppConfig();
  return recordingTranscriptionEnabledFromConfig(config);
}

export function recordingTranscriptionEnabledFromConfig(
  config: ResolvedAppConfig
): boolean {
  return config.enableRecordingTranscription && Boolean(config.whisperBin?.trim());
}

export async function downloadRecordingAudio(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;

    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_AUDIO_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_AUDIO_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

/** Transcribe audio using local OpenAI Whisper CLI (`pip install openai-whisper`). */
export async function transcribeWithWhisperCli(
  audio: Buffer,
  extension = "mp4"
): Promise<string | null> {
  const config = await getImportAppConfig();
  const whisperBin = config.whisperBin?.trim();
  if (!whisperBin) return null;

  const model = config.whisperModel?.trim() || "tiny";
  const workDir = await mkdtemp(join(tmpdir(), "next-meeting-"));
  const inputPath = join(workDir, `recording.${extension}`);
  const outputBase = join(workDir, "recording");

  try {
    await writeFile(inputPath, audio);

    await execFileAsync(
      whisperBin,
      [
        inputPath,
        "--model",
        model,
        "--output_format",
        "txt",
        "--output_dir",
        workDir,
        "--language",
        "en",
        "--fp16",
        "False",
      ],
      { timeout: TRANSCRIBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }
    );

    const txt = await readFile(`${outputBase}.txt`, "utf8").catch(() => null);
    return txt?.trim() || null;
  } catch {
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
