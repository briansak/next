import type { CommunicationSource } from "@prisma/client";
import {
  classifyInternalCall,
  type InternalCallType,
} from "../integrations/gong/internal-calls";

export interface InternalCallMetadata {
  internalCallType?: InternalCallType;
  internalCallLabel?: string;
  gongSummaryText?: string;
  gongActionItems?: string[];
  gongReplayUrl?: string;
  gongMeetingTitle?: string;
  gongReceivedAt?: string;
  fromGongEmail?: boolean;
  fromReplayEmail?: boolean;
  replayUrl?: string;
  replayPlatform?: string;
  replaySummarySource?: "email" | "ollama" | "transcript";
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
  if (/gong\.io/i.test(url)) return "gong";
  if (/webex\.com/i.test(url)) return "webex";
  if (/zoom\.us/i.test(url)) return "zoom";
  if (/stream\.microsoft/i.test(url)) return "stream";
  if (/sharepoint\.com/i.test(url)) return "sharepoint";
  if (/campaignmgr\.cisco\.com/i.test(url)) return "cisco";
  if (/vidcast\.io/i.test(url)) return "vidcast";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}
