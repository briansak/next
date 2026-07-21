import type { CallHighlight } from "@/lib/heuristics/ollama-vision";
import { summarizeMeetingTranscript } from "@/lib/heuristics/ollama";
import {
  buildMeetingHighlights,
  estimateDurationFromSummaryInput,
} from "@/lib/heuristics/meeting-highlights";
import { getAppConfig } from "@/lib/config/app-config-store";
import { ollamaRuntimeFromConfig } from "@/lib/config/app-config";
import {
  buildHeuristicTranscriptSummary,
  meetingOllamaSummaryEnabledFromConfig,
} from "@/lib/heuristics/transcript-summary";
import {
  downloadRecordingAudio,
  recordingTranscriptionEnabled,
  transcribeWithWhisperCli,
} from "./recording-transcribe";
import {
  getMeetingSummaries,
  getRecordingDetails,
  listMeetingRecordings,
  listMeetingTranscripts,
  recordingDownloadUrl,
  recordingMatchesMeeting,
  recordingPlaybackUrl,
  recordingTranscriptDownloadUrl,
  transcriptDownloadUrl,
  type MeetingEnrichment,
  type WebexMeeting,
  type WebexRecording,
} from "./meetings";
import { parseTranscriptParts, truncateForSummary } from "./transcript-text";

export type SummarySource = "webex-ai" | "ollama" | "heuristic" | "none";
export type TranscriptSource = "webex" | "whisper" | "none";

export interface MeetingIntelligence {
  summaryText?: string;
  summaryActionItems: string[];
  summarySource: SummarySource;
  transcriptText?: string;
  transcriptSource: TranscriptSource;
  transcriptDownloadUrl?: string;
  recordingDownloadUrl?: string;
  recordingPlaybackUrl?: string;
  recordingId?: string;
  callHighlights?: CallHighlight[];
}

async function resolveRecordingUrls(
  accessToken: string,
  recording: WebexRecording
): Promise<{ downloadUrl?: string; playbackUrl?: string; detail?: WebexRecording }> {
  let downloadUrl = recordingDownloadUrl(recording);
  let playbackUrl = recordingPlaybackUrl(recording);
  let detail: WebexRecording | null = recording;

  if (!downloadUrl || !recordingTranscriptDownloadUrl(recording)) {
    detail = await getRecordingDetails(accessToken, recording.id).catch(
      () => recording
    );
    if (detail) {
      downloadUrl = downloadUrl ?? recordingDownloadUrl(detail);
      playbackUrl = playbackUrl ?? recordingPlaybackUrl(detail);
    }
  }

  return { downloadUrl, playbackUrl, detail: detail ?? recording };
}

async function downloadTranscriptFromUrl(
  url: string,
  accessToken: string
): Promise<{ text: string; summaryInput: string } | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (!response.ok) {
      const fallback = await fetch(url, { redirect: "follow" });
      if (!fallback.ok) return null;
      return parseTranscriptParts(await fallback.text());
    }
    return parseTranscriptParts(await response.text());
  } catch {
    return null;
  }
}

async function resolveTranscriptText(
  accessToken: string,
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment,
  matchedRecording?: WebexRecording,
  recordingDetail?: WebexRecording
): Promise<{
  text?: string;
  summaryInput?: string;
  source: TranscriptSource;
  downloadUrl?: string;
}> {
  const meetingIds = new Set<string>([meeting.id]);
  if (matchedRecording?.meetingId) meetingIds.add(matchedRecording.meetingId);

  for (const meetingId of meetingIds) {
    const transcripts =
      enrichment.transcripts.length > 0
        ? enrichment.transcripts
        : await listMeetingTranscripts(accessToken, meetingId).catch(() => []);

    for (const transcript of transcripts) {
      const url = transcriptDownloadUrl(transcript);
      if (!url) continue;
      const parsed = await downloadTranscriptFromUrl(url, accessToken);
      if (parsed?.text) {
        return {
          text: parsed.text,
          summaryInput: parsed.summaryInput,
          source: "webex",
          downloadUrl: url,
        };
      }
    }
  }

  const recordingTranscriptUrl = recordingDetail
    ? recordingTranscriptDownloadUrl(recordingDetail)
    : undefined;
  if (recordingTranscriptUrl) {
    const parsed = await downloadTranscriptFromUrl(
      recordingTranscriptUrl,
      accessToken
    );
    if (parsed?.text) {
      return {
        text: parsed.text,
        summaryInput: parsed.summaryInput,
        source: "webex",
        downloadUrl: recordingTranscriptUrl,
      };
    }
  }

  if (matchedRecording && recordingTranscriptionEnabled()) {
    const audioUrl = recordingDownloadUrl(recordingDetail ?? matchedRecording);
    if (audioUrl) {
      const audio = await downloadRecordingAudio(audioUrl);
      if (audio) {
        const ext = audioUrl.includes(".m4a") ? "m4a" : "mp4";
        const text = await transcribeWithWhisperCli(audio, ext);
        if (text) {
          return { text, summaryInput: text, source: "whisper" };
        }
      }
    }
  }

  return { source: "none" };
}

async function summarizeFromTranscript(
  meetingTitle: string,
  transcript: string,
  summaryInput?: string,
      userId?: string
): Promise<{ text: string; source: SummarySource; actionItems: string[] }> {
  const truncated = truncateForSummary(summaryInput?.trim() || transcript);
  const appConfig = userId ? await getAppConfig(userId) : null;
  const ollamaRuntime = appConfig ? ollamaRuntimeFromConfig(appConfig) : null;
  const meetingOllamaEnabled = appConfig
    ? meetingOllamaSummaryEnabledFromConfig(appConfig)
    : false;

  if (meetingOllamaEnabled) {
    const ollama = await summarizeMeetingTranscript(
      truncated,
      meetingTitle,
      ollamaRuntime
    );
    if (ollama?.summary?.trim()) {
      return {
        text: ollama.summary.trim(),
        source: "ollama",
        actionItems: (ollama.actionItems ?? [])
          .filter(Boolean)
          .slice(0, 8),
      };
    }
  }

  const heuristic = buildHeuristicTranscriptSummary(meetingTitle, truncated);
  return {
    text: heuristic.text,
    source: "heuristic",
    actionItems: heuristic.actionItems,
  };
}

export async function resolveMeetingIntelligence(
  accessToken: string,
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment,
      userId?: string
): Promise<MeetingIntelligence> {
  const allRecordings = await listMeetingRecordings(accessToken, meeting).catch(
    () => enrichment.recordings
  );
  const mergedRecordings = [...allRecordings];
  for (const recording of enrichment.recordings) {
    if (!mergedRecordings.some((item) => item.id === recording.id)) {
      mergedRecordings.push(recording);
    }
  }

  const matchedRecording =
    mergedRecordings.find((r) => recordingMatchesMeeting(r, meeting)) ??
    mergedRecordings[0];

  const recordingUrls = matchedRecording
    ? await resolveRecordingUrls(accessToken, matchedRecording)
    : { downloadUrl: undefined, playbackUrl: undefined, detail: undefined };

  let summaryText = enrichment.summary?.note;
  let summaryActionItems = (enrichment.summary?.actionItems ?? []).map((item) =>
    typeof item === "string" ? item : item.text ?? ""
  ).filter(Boolean);
  let summarySource: SummarySource = summaryText ? "webex-ai" : "none";

  if (!summaryText) {
    const meetingIds = new Set(
      [meeting.id, matchedRecording?.meetingId].filter(Boolean) as string[]
    );
    for (const id of meetingIds) {
      const summaries = await getMeetingSummaries(accessToken, id).catch(() => []);
      if (summaries[0]?.note) {
        summaryText = summaries[0].note;
        summaryActionItems = (summaries[0].actionItems ?? []).map((item) =>
          typeof item === "string" ? item : item.text ?? ""
        ).filter(Boolean);
        summarySource = "webex-ai";
        break;
      }
    }
  }

  const transcriptResult = await resolveTranscriptText(
    accessToken,
    meeting,
    enrichment,
    matchedRecording,
    recordingUrls.detail
  );

  if (!summaryText && transcriptResult.text) {
    const derived = await summarizeFromTranscript(
      meeting.title,
      transcriptResult.text,
      transcriptResult.summaryInput,
      userId
    );
    summaryText = derived.text;
    summarySource = derived.source;
    if (derived.actionItems.length > 0) {
      summaryActionItems = derived.actionItems;
    }
  }

  let callHighlights: CallHighlight[] | undefined;
  if (transcriptResult.summaryInput?.trim()) {
    const durationSeconds = estimateDurationFromSummaryInput(
      transcriptResult.summaryInput
    );
    callHighlights = await buildMeetingHighlights({
      meetingTitle: meeting.title,
      summaryInput: transcriptResult.summaryInput,
      durationSeconds: Math.max(durationSeconds, 60),
      userId,
    });
  }

  return {
    summaryText,
    summaryActionItems,
    summarySource,
    transcriptText: transcriptResult.text,
    transcriptSource: transcriptResult.source,
    transcriptDownloadUrl: transcriptResult.downloadUrl,
    recordingDownloadUrl: recordingUrls.downloadUrl,
    recordingPlaybackUrl: recordingUrls.playbackUrl,
    recordingId: matchedRecording?.id,
    callHighlights,
  };
}
