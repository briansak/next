import type { CommunicationSource } from "@prisma/client";

export interface ProductAnnouncementMetadata {
  productAnnouncement?: boolean;
  productName?: string;
  productVersion?: string;
  vendor?: string;
  technologyLabel?: string;
  announcementSummary?: string;
  learnMoreUrl?: string;
  fromProductEmail?: boolean;
}

export function isProductAnnouncementCommunication(
  tags: string[],
  metadata: unknown
): boolean {
  if (tags.includes("product-announcement")) return true;

  const meta = (metadata ?? {}) as ProductAnnouncementMetadata;
  return Boolean(meta.productAnnouncement || meta.fromProductEmail);
}

export function productAnnouncementSummary(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as ProductAnnouncementMetadata;
  return meta.announcementSummary?.trim() ?? null;
}

export function productAnnouncementLabel(metadata: unknown): string {
  const meta = (metadata ?? {}) as ProductAnnouncementMetadata;
  return meta.technologyLabel?.trim() || "Product updates";
}

export function productAnnouncementTitle(
  subject: string | null,
  metadata: unknown
): string {
  const meta = (metadata ?? {}) as ProductAnnouncementMetadata;
  return meta.productName?.trim() || subject?.trim() || "Product announcement";
}

export function shouldExcludeFromPriorities(
  source: CommunicationSource,
  tags: string[],
  metadata: unknown
): boolean {
  if (source !== "EMAIL") return false;
  return isProductAnnouncementCommunication(tags, metadata);
}
