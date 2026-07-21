import type { CommunicationSource } from "@prisma/client";
import type { CallHighlight } from "@/lib/heuristics/ollama-vision";
import {
  classifyInternalCall,
  type InternalCallType,
} from "../integrations/gong/internal-calls";
import {
  detectReplayPlatform,
  extractReplayUrl,
} from "../integrations/internal-calls/replay-email";

export interface InternalCallMetadata {
  internalCallType?: InternalCallType;
  internalCallLabel?: string;
  gongSummaryText?: string;
  gongTranscriptText?: string;
  gongActionItems?: string[];
  gongReplayUrl?: string;
  gongMeetingTitle?: string;
  gongReceivedAt?: string;
  fromGongEmail?: boolean;
  fromReplayEmail?: boolean;
  replayUrl?: string;
  replayPlatform?: string;
  replaySummarySource?: "email" | "ollama" | "transcript" | "vidcast";
  transcriptText?: string;
  callHighlights?: CallHighlight[];
  vidcastShareId?: string;
  vidcastVideoId?: string;
  vidcastShareUrl?: string;
  replayBridgeUrl?: string;
  participantEmails?: string[];
  relevantUserEmails?: string[];
  recordingDownloadUrl?: string;
  webLink?: string;
}

export function isInternalCallCommunication(
  source: CommunicationSource,
  subject: string | null,
  tags: string[],
  metadata: unknown
): boolean {
  if (tags.includes("internal-call")) return true;

  const meta = (metadata ?? {}) as InternalCallMetadata;
  if (meta.internalCallType) return true;
  if (meta.fromGongEmail) return true;
  if (meta.fromReplayEmail) return true;

  const title = meta.gongMeetingTitle ?? subject ?? "";
  if (
    (source === "WEBEX_MEETING" || tags.includes("gong-summary")) &&
    classifyInternalCall(title, subject ?? undefined)
  ) {
    return true;
  }

  return false;
}

export function viewerAttendedInternalCall(
  metadata: unknown,
  userEmail: string
): boolean | null {
  const meta = (metadata ?? {}) as InternalCallMetadata;
  const email = userEmail.toLowerCase();
  const participants = [
    ...(meta.participantEmails ?? []),
    ...(meta.relevantUserEmails ?? []),
  ].map((value) => value.toLowerCase());

  if (participants.length === 0) return null;
  return participants.includes(email);
}

export function internalCallReplayUrl(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as InternalCallMetadata;
  return (
    meta.vidcastShareUrl ??
    meta.replayUrl ??
    meta.gongReplayUrl ??
    meta.recordingDownloadUrl ??
    meta.webLink ??
    null
  );
}

export function internalCallReplayPlatform(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as InternalCallMetadata;
  if (meta.replayPlatform) return meta.replayPlatform;
  const url = internalCallReplayUrl(metadata);
  if (!url) return null;
  return detectReplayPlatform(url);
}

export function resolveInternalCallReplay(
  metadata: unknown,
  ...textSources: Array<string | null | undefined>
): { url: string | null; platform: string | null } {
  const urlFromMeta = internalCallReplayUrl(metadata);
  if (urlFromMeta) {
    return {
      url: urlFromMeta,
      platform: internalCallReplayPlatform(metadata),
    };
  }

  for (const source of textSources) {
    const text = source?.trim();
    if (!text) continue;
    const extracted = extractReplayUrl(text);
    if (extracted) {
      return {
        url: extracted,
        platform: detectReplayPlatform(extracted),
      };
    }
  }

  return { url: null, platform: null };
}
