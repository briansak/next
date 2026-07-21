import { prisma } from "@/lib/db";
import { isPrioritiesCommunication } from "@/lib/communications/space-purpose";
import { isInternalCallCommunication } from "@/lib/communications/internal-call";
import { isProductAnnouncementCommunication } from "@/lib/communications/product-announcement";
import type { CommunicationSource, Priority } from "@prisma/client";

export const PARTNER_ASK_LOOKBACK_DAYS = 30;

export interface PartnerAskCandidateRow {
  id: string;
  subject: string | null;
  body: string;
  excerpt: string | null;
  summary: string | null;
  source: CommunicationSource;
  priority: Priority;
  receivedAt: Date;
  authorName: string | null;
  tags: string[];
  metadata: unknown;
}

export async function loadPartnerAskCandidates(input: {
    since: Date;
  limit?: number;
}): Promise<PartnerAskCandidateRow[]> {
  const webexLimit = Math.min(input.limit ?? 150, 100);

  const [emails, webexMessages] = await Promise.all([
    prisma.communication.findMany({
      where: {
        source: "EMAIL",
        receivedAt: { gte: input.since },
      },
      select: {
        id: true,
        subject: true,
        body: true,
        excerpt: true,
        summary: true,
        source: true,
        priority: true,
        receivedAt: true,
        authorName: true,
        tags: true,
        metadata: true,
      },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.communication.findMany({
      where: {
        source: "WEBEX",
        receivedAt: { gte: input.since },
      },
      select: {
        id: true,
        subject: true,
        body: true,
        excerpt: true,
        summary: true,
        source: true,
        priority: true,
        receivedAt: true,
        authorName: true,
        tags: true,
        metadata: true,
      },
      orderBy: { receivedAt: "desc" },
      take: webexLimit,
    }),
  ]);

  const rows = [...emails, ...webexMessages].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()
  );

  return rows.filter(
    (row) =>
      isPrioritiesCommunication(row.source, row.metadata) &&
      !isInternalCallCommunication(
        row.source,
        row.subject,
        row.tags,
        row.metadata
      ) &&
      !isProductAnnouncementCommunication(row.tags, row.metadata)
  );
}
