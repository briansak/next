import type { CommitmentOwner, CommunicationSource, Priority } from "@prisma/client";
import type { PartnerAskItem } from "./partner-asks";

export interface CommitmentCandidate {
  title: string;
  communicationId: string | null;
  owner: CommitmentOwner;
  ownerHint?: string;
  dueAt?: Date;
  source: string;
  priority?: Priority;
  receivedAt?: Date;
}

interface MeetingActionItem {
  title: string;
  assigneeUserIds?: string[];
  source?: string;
}

interface MeetingMetadata {
  actionItems?: MeetingActionItem[];
  summaryActionItems?: string[];
  gongActionItems?: string[];
}

const PARTNER_OWE_RE =
  /\b(?:partner|customer|wwt|they|their team)\b.{0,40}\b(?:will|to send|to provide|to share|to confirm)\b/i;
const ME_OWE_RE =
  /\b(?:i will|we will|i'll|we'll|please send|need to send|follow up with|get back to)\b/i;
const INTERNAL_OWE_RE =
  /\b(?:pm|product|legal|finance|tac|support team|internal)\b.{0,40}\b(?:will|to send|to review)\b/i;

export function inferCommitmentOwner(
  title: string,
  context?: { userId?: string; assigneeUserIds?: string[]; authorEmail?: string | null }
): CommitmentOwner {
  if (context?.assigneeUserIds?.length && context.userId) {
    if (context.assigneeUserIds.includes(context.userId)) return "ME";
  }

  const lower = title.toLowerCase();
  if (ME_OWE_RE.test(title) || /\brespond\b/i.test(title)) return "ME";
  if (PARTNER_OWE_RE.test(title)) return "PARTNER";
  if (INTERNAL_OWE_RE.test(title)) return "INTERNAL";

  if (lower.includes("you were @mentioned") || lower.includes("respond —")) {
    return "ME";
  }

  return "UNKNOWN";
}

export function meetingActionItems(meta: MeetingMetadata): MeetingActionItem[] {
  if (meta.actionItems?.length) return meta.actionItems;
  if (meta.summaryActionItems?.length) {
    return meta.summaryActionItems.map((title) => ({ title }));
  }
  return (meta.gongActionItems ?? []).map((title) => ({ title, source: "gong" }));
}

export function extractMeetingCommitments(input: {
  communicationId: string;
  metadata: unknown;
  userId: string;
  receivedAt: Date;
}): CommitmentCandidate[] {
  const meta = (input.metadata ?? {}) as MeetingMetadata;
  const items = meetingActionItems(meta);
  const candidates: CommitmentCandidate[] = [];

  for (const item of items) {
    const title = item.title.trim();
    if (title.length < 8) continue;

    candidates.push({
      title,
      communicationId: input.communicationId,
      owner: inferCommitmentOwner(title, {
        userId: input.userId,
        assigneeUserIds: item.assigneeUserIds,
      }),
      ownerHint: item.assigneeUserIds?.length ? "Assigned in meeting" : undefined,
      source: item.source ?? "meeting",
      receivedAt: input.receivedAt,
    });
  }

  return candidates;
}

export function partnerAskToCommitment(ask: PartnerAskItem): CommitmentCandidate {
  return {
    title: ask.ask,
    communicationId: ask.communicationId,
    owner: "ME",
    ownerHint: ask.authorName ?? "Partner ask",
    source: "partner-ask",
    priority: ask.priority,
    receivedAt: ask.receivedAt,
  };
}

export function nextStepToCommitment(input: {
  id: string;
  title: string;
  communicationId: string | null;
  assigneeId: string | null;
  userId: string;
  dueAt: Date | null;
}): CommitmentCandidate {
  const owner: CommitmentOwner =
    input.assigneeId === input.userId || !input.assigneeId ? "ME" : "INTERNAL";

  return {
    title: input.title,
    communicationId: input.communicationId,
    owner,
    ownerHint: input.assigneeId ? "Assigned next step" : undefined,
    dueAt: input.dueAt ?? undefined,
    source: "next-step",
  };
}

export function commitmentOwnerLabel(owner: CommitmentOwner): string {
  switch (owner) {
    case "ME":
      return "You owe";
    case "PARTNER":
      return "Partner owes";
    case "INTERNAL":
      return "Internal owes";
    default:
      return "Open item";
  }
}

export function commitmentSourceLabel(source: string | null): string {
  switch (source) {
    case "partner-ask":
      return "Partner ask";
    case "meeting":
      return "Meeting";
    case "gong":
      return "Gong";
    case "next-step":
      return "Next step";
    default:
      return "Commitment";
  }
}

export function dedupeCommitmentCandidates(
  candidates: CommitmentCandidate[]
): CommitmentCandidate[] {
  const seen = new Set<string>();
  const result: CommitmentCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.communicationId ?? "none"}::${candidate.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function collectCommitmentCandidates(input: {
  userId: string;
  partnerAsks: PartnerAskItem[];
  meetings: Array<{ id: string; metadata: unknown; receivedAt: Date }>;
  nextSteps: Array<{
    id: string;
    title: string;
    communicationId: string | null;
    assigneeId: string | null;
    dueAt: Date | null;
  }>;
}): CommitmentCandidate[] {
  const candidates: CommitmentCandidate[] = [];

  for (const ask of input.partnerAsks) {
    candidates.push(partnerAskToCommitment(ask));
  }

  for (const meeting of input.meetings) {
    candidates.push(
      ...extractMeetingCommitments({
        communicationId: meeting.id,
        metadata: meeting.metadata,
        userId: input.userId,
        receivedAt: meeting.receivedAt,
      })
    );
  }

  for (const step of input.nextSteps) {
    candidates.push(
      nextStepToCommitment({
        id: step.id,
        title: step.title,
        communicationId: step.communicationId,
        assigneeId: step.assigneeId,
        userId: input.userId,
        dueAt: step.dueAt,
      })
    );
  }

  return dedupeCommitmentCandidates(candidates);
}
