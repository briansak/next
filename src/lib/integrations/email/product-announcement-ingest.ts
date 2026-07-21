import { mergeCommunicationMetadata } from "@/lib/communications/viewer-override";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { EmailMessage } from "./allowlist";
import {
  parseProductAnnouncementEmail,
  type ProductAnnouncementContent,
} from "./product-announcement";

export const PRODUCT_ANNOUNCEMENT_LOOKBACK_DAYS = 45;

export interface ProductAnnouncementIngestResult {
  handled: boolean;
  created: boolean;
  upgraded?: boolean;
  id?: string;
}

export async function tryIngestProductAnnouncementEmail(
    parsed: EmailMessage
): Promise<ProductAnnouncementIngestResult> {
  const announcement = parseProductAnnouncementEmail(parsed);
  if (!announcement) {
    return { handled: false, created: false };
  }

  const existing = await prisma.communication.findFirst({
    where: {
      externalId: announcement.messageId,
      source: "EMAIL",
    },
    select: { id: true, tags: true },
  });

  if (existing?.tags.includes("product-announcement")) {
    return { handled: true, created: false, id: existing.id };
  }

  const id = await upsertProductAnnouncement( announcement, existing?.id);

  return {
    handled: true,
    created: !existing,
    upgraded: Boolean(existing),
    id,
  };
}

async function upsertProductAnnouncement(
    announcement: ProductAnnouncementContent,
  existingId?: string
): Promise<string> {
  let existingMetadata: unknown;
  if (existingId) {
    const existing = await prisma.communication.findUnique({
      where: { id: existingId },
      select: { metadata: true },
    });
    existingMetadata = existing?.metadata;
  }

  const metadata = mergeCommunicationMetadata(existingMetadata, {
    productAnnouncement: true,
    fromProductEmail: true,
    productName: announcement.productName,
    productVersion: announcement.productVersion,
    vendor: announcement.vendor,
    technologyLabel: announcement.technologyLabel,
    announcementSummary: announcement.summary,
    learnMoreUrl: announcement.learnMoreUrl,
    messageId: announcement.messageId,
  });

  const data = {
    subject: announcement.subject,
    body: announcement.bodyText,
    excerpt: announcement.summary.split("\n")[0]?.slice(0, 220) ?? announcement.productName,
    summary: announcement.summary.slice(0, 2000),
    authorName: announcement.fromName ?? announcement.vendor ?? null,
    authorEmail: announcement.fromAddress,
    receivedAt: announcement.receivedAt,
    priority: "INFO" as const,
    priorityScore: 1,
    priorityReasons: [`${announcement.technologyLabel} product announcement`],
    tags: ["product-announcement", "technology-announcement", "email"],
    metadata: metadata as Prisma.InputJsonValue,
  };

  if (existingId) {
    const updated = await prisma.communication.update({
      where: { id: existingId },
      data,
      select: { id: true },
    });
    return updated.id;
  }

  const communication = await prisma.communication.create({
    data: {
      source: "EMAIL",
      externalId: announcement.messageId,
      ...data,
    },
    select: { id: true },
  });

  return communication.id;
}

export interface BackfillProductAnnouncementsResult {
  scanned: number;
  upgraded: number;
  created: number;
}

export async function backfillProductAnnouncements(
  ): Promise<BackfillProductAnnouncementsResult> {
  const since = new Date(
    Date.now() - PRODUCT_ANNOUNCEMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const candidates = await prisma.communication.findMany({
    where: {
      source: "EMAIL",
      receivedAt: { gte: since },
      NOT: { tags: { has: "product-announcement" } },
    },
    orderBy: { receivedAt: "desc" },
    take: 250,
    select: {
      id: true,
      externalId: true,
      subject: true,
      body: true,
      authorEmail: true,
      authorName: true,
      receivedAt: true,
      metadata: true,
    },
  });

  let upgraded = 0;
  let created = 0;

  for (const row of candidates) {
    const meta = (row.metadata ?? {}) as { threadId?: string };
    const result = await tryIngestProductAnnouncementEmail( {
      messageId: row.externalId,
      subject: row.subject ?? "",
      body: row.body,
      fromAddress: row.authorEmail ?? "",
      fromName: row.authorName ?? undefined,
      receivedAt: row.receivedAt,
      threadId: meta.threadId,
      toAddresses: [],
      ccAddresses: [],
    });

    if (!result.handled) continue;
    if (result.created) created += 1;
    else if (result.upgraded) upgraded += 1;
  }

  return { scanned: candidates.length, upgraded, created };
}
