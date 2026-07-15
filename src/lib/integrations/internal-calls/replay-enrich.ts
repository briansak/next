import {
  downloadRecordingAudio,
  recordingTranscriptionEnabled,
  transcribeWithWhisperCli,
} from "@/lib/integrations/webex/recording-transcribe";
import {
  summarizeMeetingTranscript,
  summarizeWithOllama,
} from "@/lib/heuristics/ollama";
import {
  isDirectMediaReplayUrl,
  type ReplayEmailContent,
} from "./replay-email";

export type ReplaySummarySource = "email" | "ollama" | "transcript";

export interface EnrichedReplaySummary {
  summary: string;
  source: ReplaySummarySource;
  actionItems: string[];
}

export async function enrichReplaySummary(
  content: ReplayEmailContent
): Promise<EnrichedReplaySummary> {
  const emailSummary = content.summary.trim();
  const actionItems: string[] = [];

  if (emailSummary.length >= 160) {
    return { summary: emailSummary, source: "email", actionItems };
  }

  const transcriptSummary = await tryTranscriptSummary(content);
  if (transcriptSummary) {
    return transcriptSummary;
  }

  const aiSummary = await tryOllamaSummary(content);
  if (aiSummary) {
    return aiSummary;
  }

  if (emailSummary.length > 0) {
    return { summary: emailSummary, source: "email", actionItems };
  }

  return {
    summary: `Replay available for ${content.meetingTitle}.`,
    source: "email",
    actionItems,
  };
}

async function tryOllamaSummary(
  content: ReplayEmailContent
): Promise<EnrichedReplaySummary | null> {
  if (!content.bodyText.trim() || content.bodyText.length < 80) return null;

  const ai = await summarizeWithOllama({
    subject: content.meetingTitle,
    body: content.bodyText.slice(0, 10_000),
    context:
      "Internal company call replay notification. Summarize the key takeaways for someone who missed the live session. Focus on announcements, roadmap, and action items.",
  });

  if (!ai?.summary?.trim()) return null;

  return {
    summary: ai.summary.trim(),
    source: "ollama",
    actionItems: (ai.actionItems ?? []).filter(Boolean).slice(0, 8),
  };
}

async function tryTranscriptSummary(
  content: ReplayEmailContent
): Promise<EnrichedReplaySummary | null> {
  if (!recordingTranscriptionEnabled() || !content.replayUrl) return null;
  if (!isDirectMediaReplayUrl(content.replayUrl)) return null;

  const audio = await downloadRecordingAudio(content.replayUrl);
  if (!audio) return null;

  const extension = content.replayUrl.match(/\.(\w+)(?:\?|$)/i)?.[1] ?? "mp4";
  const transcript = await transcribeWithWhisperCli(audio, extension);
  if (!transcript || transcript.length < 80) return null;

  const ai = await summarizeMeetingTranscript(transcript, content.meetingTitle);
  if (!ai?.summary?.trim()) {
    return {
      summary: transcript.slice(0, 1200),
      source: "transcript",
      actionItems: (ai?.actionItems ?? []).filter(Boolean).slice(0, 8),
    };
  }

  return {
    summary: ai.summary.trim(),
    source: "transcript",
    actionItems: (ai.actionItems ?? []).filter(Boolean).slice(0, 8),
  };
}

export function replaySummaryLabel(source: ReplaySummarySource): string {
  switch (source) {
    case "transcript":
      return "Transcript summary";
    case "ollama":
      return "AI summary";
    default:
      return "Email summary";
  }
}
