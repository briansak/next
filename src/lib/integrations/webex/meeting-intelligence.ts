import { summarizeMeetingTranscript } from "@/lib/heuristics/ollama";
import {
  downloadRecordingAudio,
  recordingTranscriptionEnabled,
  transcribeWithWhisperCli,
} from "./recording-transcribe";
import {
  getMeetingSummaries,
  listMeetingRecordings,
  listMeetingTranscripts,
  recordingDownloadUrl,
  transcriptDownloadUrl,
  type MeetingEnrichment,
  type WebexMeeting,
  type WebexRecording,
} from "./meetings";
import { parseTranscriptContent, truncateForSummary } from "./transcript-text";

export type SummarySource = "webex-ai" | "ollama" | "none";
export type TranscriptSource = "webex" | "whisper" | "none";

export interface MeetingIntelligence {
  summaryText?: string;
  summaryActionItems: string[];
  summarySource: SummarySource;
  transcriptText?: string;
  transcriptSource: TranscriptSource;
  transcriptDownloadUrl?: string;
  recordingDownloadUrl?: string;
}

function recordingMatchesMeeting(
  recording: WebexRecording,
  meeting: WebexMeeting
): boolean {
  if (recording.meetingId === meeting.id) return true;

  const meetingSeriesId =
    meeting.meetingSeriesId ?? meeting.id.split("_I_")[0];
  if (recording.meetingSeriesId && recording.meetingSeriesId === meetingSeriesId) {
    return true;
  }

  const prefix = meeting.id.split("_I_")[0];
  return Boolean(recording.meetingId?.startsWith(prefix));
}

async function downloadTranscriptFromUrl(
  url: string,
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (!response.ok) {
      const fallback = await fetch(url, { redirect: "follow" });
      if (!fallback.ok) return null;
      return parseTranscriptContent(await fallback.text());
    }
    return parseTranscriptContent(await response.text());
  } catch {
    return null;
  }
}

async function resolveTranscriptText(
  accessToken: string,
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment,
  matchedRecording?: WebexRecording
): Promise<{ text?: string; source: TranscriptSource; downloadUrl?: string }> {
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
      const text = await downloadTranscriptFromUrl(url, accessToken);
      if (text) {
        return { text, source: "webex", downloadUrl: url };
      }
    }
  }

  if (matchedRecording && recordingTranscriptionEnabled()) {
    const audioUrl = recordingDownloadUrl(matchedRecording);
    if (audioUrl) {
      const audio = await downloadRecordingAudio(audioUrl);
      if (audio) {
        const ext = audioUrl.includes(".m4a") ? "m4a" : "mp4";
        const text = await transcribeWithWhisperCli(audio, ext);
        if (text) {
          return { text, source: "whisper" };
        }
      }
    }
  }

  return { source: "none" };
}

export async function resolveMeetingIntelligence(
  accessToken: string,
  meeting: WebexMeeting,
  enrichment: MeetingEnrichment
): Promise<MeetingIntelligence> {
  const allRecordings = await listMeetingRecordings(accessToken, meeting.id).catch(
    () => enrichment.recordings
  );
  const matchedRecording =
    allRecordings.find((r) => recordingMatchesMeeting(r, meeting)) ??
    enrichment.recordings.find((r) => recordingMatchesMeeting(r, meeting));

  let summaryText = enrichment.summary?.note;
  let summaryActionItems = (enrichment.summary?.actionItems ?? []).map((item) =>
    typeof item === "string" ? item : item.text ?? ""
  ).filter(Boolean);
  let summarySource: SummarySource = summaryText ? "webex-ai" : "none";

  if (!summaryText) {
    const meetingIds = new Set([meeting.id, matchedRecording?.meetingId].filter(Boolean) as string[]);
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
    matchedRecording
  );

  if (!summaryText && transcriptResult.text) {
    const ollama = await summarizeMeetingTranscript(
      truncateForSummary(transcriptResult.text),
      meeting.title
    );
    if (ollama?.summary) {
      summaryText = ollama.summary;
      summarySource = "ollama";
      if (ollama.actionItems?.length) {
        summaryActionItems = ollama.actionItems.filter(Boolean);
      } else if (ollama.suggestedAction) {
        summaryActionItems = [ollama.suggestedAction];
      }
    }
  }

  return {
    summaryText,
    summaryActionItems,
    summarySource,
    transcriptText: transcriptResult.text,
    transcriptSource: transcriptResult.source,
    transcriptDownloadUrl: transcriptResult.downloadUrl,
    recordingDownloadUrl: matchedRecording
      ? recordingDownloadUrl(matchedRecording)
      : undefined,
  };
}
