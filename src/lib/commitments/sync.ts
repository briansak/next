import { prisma } from "@/lib/db";
import { isDayJobCommunication } from "@/lib/communications/space-purpose";
import type { CommitmentOwner, CommitmentStatus } from "@prisma/client";
import {
  collectCommitmentCandidates,
  type CommitmentCandidate,
} from "@/lib/heuristics/commitments";
import type { PartnerAskItem } from "@/lib/heuristics/partner-asks";

export interface CommitmentLedgerItem {
  id: string;
  title: string;
  owner: CommitmentOwner;
  ownerHint: string | null;
  status: CommitmentStatus;
  source: string | null;
  dueAt: Date | null;
  communicationId: string | null;
  updatedAt: Date;
}

export async function syncCommitmentsForUser(input: {
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
}): Promise<void> {
  await dismissNonDayJobCommitments();

  const candidates = collectCommitmentCandidates(input);

  for (const candidate of candidates) {
    await upsertCommitment(candidate);
  }
}

/** @deprecated */
export const syncCommitmentsForTenant = syncCommitmentsForUser;

async function dismissNonDayJobCommitments(): Promise<void> {
  const open = await prisma.commitment.findMany({
    where: {
      status: "OPEN",
      communicationId: { not: null },
    },
    select: {
      id: true,
      communication: {
        select: { source: true, metadata: true },
      },
    },
  });

  const ids = open
    .filter(
      (row) =>
        row.communication &&
        !isDayJobCommunication(row.communication.source, row.communication.metadata)
    )
    .map((row) => row.id);

  if (ids.length === 0) return;

  await prisma.commitment.updateMany({
    where: { id: { in: ids } },
    data: { status: "DISMISSED" },
  });
}

async function upsertCommitment(candidate: CommitmentCandidate): Promise<void> {
  const communicationId = candidate.communicationId ?? null;

  const existing = await prisma.commitment.findFirst({
    where: {
      title: candidate.title,
      communicationId,
    },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status !== "OPEN") return;
    await prisma.commitment.update({
      where: { id: existing.id },
      data: {
        owner: candidate.owner,
        ownerHint: candidate.ownerHint ?? undefined,
        dueAt: candidate.dueAt ?? undefined,
        source: candidate.source,
      },
    });
    return;
  }

  await prisma.commitment.create({
    data: {
      communicationId,
      title: candidate.title,
      owner: candidate.owner,
      ownerHint: candidate.ownerHint ?? null,
      dueAt: candidate.dueAt ?? null,
      source: candidate.source,
      status: "OPEN",
    },
  });
}

export async function listOpenCommitments(
  limit = 12
): Promise<CommitmentLedgerItem[]> {
  const rows = await prisma.commitment.findMany({
    where: {
      status: "OPEN",
    },
    orderBy: [{ owner: "asc" }, { updatedAt: "desc" }],
    take: limit * 4,
    select: {
      id: true,
      title: true,
      owner: true,
      ownerHint: true,
      status: true,
      source: true,
      dueAt: true,
      communicationId: true,
      updatedAt: true,
      communication: {
        select: { source: true, metadata: true },
      },
    },
  });

  return rows
    .filter(
      (row) =>
        !row.communicationId ||
        (row.communication &&
          isDayJobCommunication(
            row.communication.source,
            row.communication.metadata
          ))
    )
    .slice(0, limit)
    .map(({ communication: _communication, ...row }) => row);
}
