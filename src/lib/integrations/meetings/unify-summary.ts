export interface UnifiedMeetingMetadata {
  meetingId?: string;
  summaryText?: string;
  summarySource?: string;
  summaryActionItems?: string[];
  gongSummaryText?: string;
  gongTranscriptText?: string;
  gongActionItems?: string[];
  gongEmailMessageIds?: string[];
  gongReceivedAt?: string;
  gongReplayUrl?: string;
  gongMeetingTitle?: string;
  replayEmailMessageIds?: string[];
  replaySummaryText?: string;
  replayReceivedAt?: string;
  replayUrl?: string;
  replayPlatform?: string;
  replaySummarySource?: string;
  vidcastShareId?: string;
  vidcastVideoId?: string;
  vidcastShareUrl?: string;
  replayBridgeUrl?: string;
  callHighlights?: Array<{
    timestamp: string;
    startSeconds: number;
    title: string;
    description: string;
  }>;
  internalCallType?: string;
  internalCallLabel?: string;
  hasSummary?: boolean;
  actionItems?: Array<{
    title: string;
    assigneeUserIds?: string[];
    source?: string;
  }>;
  transcriptText?: string;
  transcriptSource?: string;
  hasRecording?: boolean;
  recordingDownloadUrl?: string;
  recordingPlaybackUrl?: string;
}

export type MeetingSourceKind =
  | "webex-transcript"
  | "webex-recording"
  | "gong"
  | "replay-email";

export interface MeetingSourceBadge {
  kind: MeetingSourceKind;
  label: string;
}

export function resolveUnifiedMeetingSummary(
  meta: UnifiedMeetingMetadata,
  fallbackSummary?: string | null
): { text: string; source: string; label: string } | null {
  const gong = meta.gongSummaryText?.trim();
  if (gong) {
    return { text: gong, source: "gong", label: "Gong AI" };
  }

  const transcript = meta.summaryText?.trim();
  if (transcript) {
    const source = meta.summarySource ?? "heuristic";
    const label =
      source === "ollama"
        ? "AI summary"
        : source === "webex-ai"
          ? "Webex AI"
          : source === "replay"
            ? "Replay summary"
            : "Summary";
    return { text: transcript, source, label };
  }

  const replay = meta.replaySummaryText?.trim();
  if (replay) {
    return { text: replay, source: "replay", label: "Replay summary" };
  }

  const fallback = fallbackSummary?.trim();
  if (fallback) {
    return { text: fallback, source: "heuristic", label: "Summary" };
  }

  return null;
}

export function meetingSourceBadges(meta: UnifiedMeetingMetadata): MeetingSourceBadge[] {
  const badges: MeetingSourceBadge[] = [];

  if (meta.transcriptText?.trim()) {
    badges.push({ kind: "webex-transcript", label: "Transcript" });
  } else if (meta.gongTranscriptText?.trim() && meetingHasRecording(meta)) {
    badges.push({ kind: "webex-transcript", label: "Gong transcript" });
  }

  if (meta.recordingDownloadUrl || meta.recordingPlaybackUrl) {
    badges.push({ kind: "webex-recording", label: "Recording" });
  }

  if (meta.gongSummaryText?.trim() || (meta.gongEmailMessageIds?.length ?? 0) > 0) {
    badges.push({ kind: "gong", label: "Gong" });
  }

  if (
    meta.replaySummaryText?.trim() ||
    meta.replayUrl ||
    (meta.replayEmailMessageIds?.length ?? 0) > 0
  ) {
    badges.push({ kind: "replay-email", label: "Replay" });
  }

  return badges;
}

export function unifiedMeetingReplayUrl(meta: UnifiedMeetingMetadata): string | null {
  return (
    meta.recordingPlaybackUrl ??
    meta.recordingDownloadUrl ??
    meta.replayUrl ??
    meta.gongReplayUrl ??
    null
  );
}

export function meetingHasRecording(meta: UnifiedMeetingMetadata): boolean {
  return Boolean(
    meta.hasRecording ||
      meta.recordingDownloadUrl ||
      meta.recordingPlaybackUrl ||
      meta.vidcastShareUrl ||
      meta.replayUrl ||
      meta.gongReplayUrl
  );
}

export function resolveMeetingTranscriptText(
  meta: UnifiedMeetingMetadata
): { text: string; source: string } | null {
  const webex = meta.transcriptText?.trim();
  if (webex) {
    return {
      text: webex,
      source: meta.transcriptSource === "gong" ? "Gong" : "Webex",
    };
  }

  const gong = meta.gongTranscriptText?.trim();
  if (gong && meetingHasRecording(meta)) {
    return { text: gong, source: "Gong" };
  }

  return null;
}
