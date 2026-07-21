import {
  downloadRecordingAudio,
  recordingTranscriptionEnabled,
  transcribeWithWhisperCli,
} from "@/lib/integrations/webex/recording-transcribe";
import { getAppConfig } from "@/lib/config/app-config-store";
import { ollamaRuntimeFromConfig } from "@/lib/config/app-config";
import {
  formatVidcastTranscriptSummary,
  ollamaConfigured,
  summarizeMeetingTranscript,
  summarizeVidcastTranscript,
  summarizeWithOllama,
} from "@/lib/heuristics/ollama";
import type { CallHighlight } from "@/lib/heuristics/ollama-vision";
import { buildHeuristicTranscriptSummary } from "@/lib/heuristics/transcript-summary";
import { condenseLongSummary, distillEmailDigest } from "@/lib/heuristics/email-digest-summary";
import { getWebexAccessToken } from "@/lib/integrations/webex/ingest";
import { fetchVidcastShareContent } from "../webex/vidcast-api";
import { resolveVidcastShareUrl } from "./replay-vidcast-resolve";
import {
  isDirectMediaReplayUrl,
  type ReplayEmailContent,
} from "./replay-email";

export type ReplaySummarySource = "email" | "ollama" | "transcript" | "vidcast";

export interface EnrichedReplaySummary {
  summary: string;
  source: ReplaySummarySource;
  actionItems: string[];
  callHighlights?: CallHighlight[];
  vidcastShareId?: string;
  vidcastVideoId?: string;
  vidcastShareUrl?: string;
  replayBridgeUrl?: string;
  transcriptText?: string;
}

export interface EnrichReplaySummaryOptions {
  userId?: string;
}

export async function enrichReplaySummary(
  content: ReplayEmailContent,
  options?: EnrichReplaySummaryOptions
): Promise<EnrichedReplaySummary> {
  const ollamaRuntime = options?.userId
    ? ollamaRuntimeFromConfig(await getAppConfig(options.userId))
    : null;

  const vidcast = await tryVidcastSummary(content, options?.userId, ollamaRuntime);
  if (vidcast) {
    return vidcast;
  }

  const emailSummary = content.summary.trim();
  const actionItems: string[] = [];

  const digest = distillEmailDigest(content.meetingTitle, content.bodyText);
  if (digest) {
    return { summary: digest, source: "email", actionItems };
  }

  if (emailSummary.length >= 160) {
    const condensed = condenseLongSummary(emailSummary, content.meetingTitle);
    if (condensed) {
      return { summary: condensed, source: "email", actionItems };
    }
    return { summary: emailSummary, source: "email", actionItems };
  }

  const transcriptSummary = await tryTranscriptSummary(content, ollamaRuntime);
  if (transcriptSummary) {
    return transcriptSummary;
  }

  const aiSummary = await tryOllamaSummary(content, ollamaRuntime);
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

async function tryVidcastSummary(
  content: ReplayEmailContent,
  userId?: string,
  ollamaRuntime?: ReturnType<typeof ollamaRuntimeFromConfig>
): Promise<EnrichedReplaySummary | null> {
  if (!userId) return null;

  const vidcastShareUrl = await resolveVidcastShareUrl({
    replayUrl: content.replayUrl,
    text: [content.bodyText, content.summary].join("\n"),
  });
  if (!vidcastShareUrl) return null;

  const accessToken = await getWebexAccessToken();
  if (!accessToken) return null;

  const shareContent = await fetchVidcastShareContent(accessToken, vidcastShareUrl);
  if (!shareContent) return null;

  const emailSummary = content.summary.trim();
  const transcriptInput =
    shareContent.transcriptSummaryInput?.trim() || shareContent.transcriptText?.trim() || "";
  const transcriptSummary = await resolveVidcastTranscriptSummary(
    transcriptInput,
    content.meetingTitle,
    ollamaRuntime
  );

  let summary = transcriptSummary?.summary ?? "";
  const actionItems = transcriptSummary?.actionItems ?? [];

  if (!summary) {
    summary =
      shareContent.summary ||
      (shareContent.highlights.length > 0
        ? shareContent.highlights
            .slice(0, 6)
            .map((item) => `- ${item.description || item.title} (${item.timestamp})`)
            .join("\n")
        : emailSummary);
  }

  if (!summary.trim()) return null;

  return {
    summary,
    source: transcriptSummary ? "transcript" : "vidcast",
    actionItems,
    callHighlights: shareContent.highlights,
    vidcastShareId: shareContent.shareId,
    vidcastVideoId: shareContent.videoId,
    vidcastShareUrl,
    replayBridgeUrl:
      content.replayUrl && content.replayUrl !== vidcastShareUrl
        ? content.replayUrl
        : undefined,
    transcriptText: shareContent.transcriptText,
  };
}

async function resolveVidcastTranscriptSummary(
  transcriptInput: string,
  meetingTitle: string,
  runtime?: ReturnType<typeof ollamaRuntimeFromConfig>
): Promise<{ summary: string; source: ReplaySummarySource; actionItems: string[] } | null> {
  if (transcriptInput.length < 80) return null;

  if (ollamaConfigured(runtime)) {
    const ai = await summarizeVidcastTranscript(transcriptInput, meetingTitle, runtime);
    const formatted = ai ? formatVidcastTranscriptSummary(ai) : "";
    if (formatted.length >= 120) {
      return {
        summary: formatted,
        source: "transcript",
        actionItems: (ai?.actionItems ?? []).filter(Boolean).slice(0, 8),
      };
    }
  }

  const heuristic = buildHeuristicTranscriptSummary(meetingTitle, transcriptInput);
  if (!heuristic.text.trim()) return null;

  return {
    summary: heuristic.text.trim(),
    source: "transcript",
    actionItems: heuristic.actionItems,
  };
}

async function tryOllamaSummary(
  content: ReplayEmailContent,
  runtime?: ReturnType<typeof ollamaRuntimeFromConfig>
): Promise<EnrichedReplaySummary | null> {
  if (!content.bodyText.trim() || content.bodyText.length < 80) return null;
  if (!ollamaConfigured(runtime)) return null;

  const ai = await summarizeWithOllama(
    {
      subject: content.meetingTitle,
      body: content.bodyText.slice(0, 10_000),
      context:
        "Internal company call replay notification. Summarize the key takeaways for someone who missed the live session. Focus on announcements, roadmap, and action items.",
    },
    runtime
  );

  if (!ai?.summary?.trim()) return null;

  return {
    summary: ai.summary.trim(),
    source: "ollama",
    actionItems: (ai.actionItems ?? []).filter(Boolean).slice(0, 8),
  };
}

async function tryTranscriptSummary(
  content: ReplayEmailContent,
  runtime?: ReturnType<typeof ollamaRuntimeFromConfig>
): Promise<EnrichedReplaySummary | null> {
  if (!recordingTranscriptionEnabled() || !content.replayUrl) return null;
  if (!isDirectMediaReplayUrl(content.replayUrl)) return null;

  const audio = await downloadRecordingAudio(content.replayUrl);
  if (!audio) return null;

  const extension = content.replayUrl.match(/\.(\w+)(?:\?|$)/i)?.[1] ?? "mp4";
  const transcript = await transcribeWithWhisperCli(audio, extension);
  if (!transcript || transcript.length < 80) return null;

  const ai = await summarizeMeetingTranscript(
    transcript,
    content.meetingTitle,
    runtime
  );
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
    case "vidcast":
      return "Vidcast AI";
    case "transcript":
      return "Transcript summary";
    case "ollama":
      return "AI summary";
    default:
      return "Email summary";
  }
}

export function isShallowReplaySummary(summary: string | null | undefined): boolean {
  const text = summary?.trim() ?? "";
  if (text.length < 180) return true;

  const bulletLines = text.split("\n").filter((line) => /^[-*•]\s+/.test(line.trim()));
  if (bulletLines.length >= 3) return false;

  const sentences =
    text.match(/[^.!?]+[.!?]+/g)?.filter((sentence) => sentence.trim().length > 8) ?? [];
  return sentences.length <= 2 && bulletLines.length === 0;
}
