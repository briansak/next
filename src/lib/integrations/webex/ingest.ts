import { prisma } from "@/lib/db";
import { analyzeCommunication } from "@/lib/heuristics";
import { getTenantMembers } from "@/lib/tenant/members";
import type { MentionUser } from "@/lib/heuristics/mentions";
import type { SpacePurpose } from "@/lib/communications/space-purpose";
import {
  createMessageWebhook,
  fetchAllowlistedMessages,
  getWebexConfig,
  refreshWebexToken,
  type WebexMessage,
  type WebexSpaceAllowlistEntry,
} from "./index";

export async function getWebexAccessToken(tenantId: string): Promise<string | null> {
  const config = getWebexConfig();
  if (!config) return null;

  const token = await prisma.integrationToken.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "WEBEX" },
    },
  });

  if (!token) return null;

  if (token.expiresAt && token.expiresAt > new Date()) {
    return token.accessToken;
  }

  if (!token.refreshToken) {
    return token.accessToken;
  }

  const refreshed = await refreshWebexToken(config, token.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

  await prisma.integrationToken.update({
    where: { id: token.id },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt,
    },
  });

  return refreshed.accessToken;
}

export async function getActiveWebexAllowlist(
  tenantId: string
): Promise<WebexSpaceAllowlistEntry[]> {
  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      tenantId,
      source: "WEBEX",
      status: "ACTIVE",
    },
    include: { webexAllowlists: true },
  });

  if (!policy) return [];

  return policy.webexAllowlists.map((a) => ({
    id: a.id,
    spaceId: a.spaceId,
    spaceTitle: a.spaceTitle ?? undefined,
    purpose: a.purpose,
    technologyLabel: a.technologyLabel ?? undefined,
  }));
}

export function isAllowlistedSpace(
  allowlist: WebexSpaceAllowlistEntry[],
  roomId: string
): boolean {
  return allowlist.some((a) => a.spaceId === roomId);
}

export async function ingestWebexMessage(
  tenantId: string,
  message: WebexMessage,
  allowlistRef?: string,
  teamMembers?: MentionUser[],
  spaceMeta?: {
    purpose?: SpacePurpose;
    spaceTitle?: string;
    technologyLabel?: string;
  }
): Promise<{ created: boolean; id: string }> {
  const body = message.text ?? "";
  const members = teamMembers ?? (await getTenantMembers(tenantId));

  const analysis = analyzeCommunication({
    body,
    authorName: message.personDisplayName,
    receivedAt: new Date(message.created),
    teamMembers: members,
  });

  const existing = await prisma.communication.findUnique({
    where: {
      tenantId_source_externalId: {
        tenantId,
        source: "WEBEX",
        externalId: message.id,
      },
    },
  });

  const spaceMetadata = {
    roomId: message.roomId,
    parentId: message.parentId,
    mentionedUserIds: analysis.mentionedUserIds,
    spacePurpose: spaceMeta?.purpose ?? "PRIORITIES",
    spaceTitle: spaceMeta?.spaceTitle,
    technologyLabel: spaceMeta?.technologyLabel,
  };

  if (existing) {
    await prisma.communication.update({
      where: { id: existing.id },
      data: {
        priority: analysis.priority,
        priorityScore: analysis.priorityScore,
        priorityReasons: analysis.priorityReasons,
        summary: analysis.summary,
        excerpt: analysis.summary,
        tags: analysis.tags,
        metadata: spaceMetadata,
      },
    });
    return { created: false, id: existing.id };
  }

  const communication = await prisma.communication.create({
    data: {
      tenantId,
      source: "WEBEX",
      externalId: message.id,
      threadId: message.parentId ?? message.roomId,
      body,
      excerpt: analysis.summary,
      authorName: message.personDisplayName,
      authorEmail: message.personEmail,
      receivedAt: new Date(message.created),
      priority: analysis.priority,
      priorityScore: analysis.priorityScore,
      priorityReasons: analysis.priorityReasons,
      summary: analysis.summary,
      tags: analysis.tags,
      allowlistRef,
      metadata: spaceMetadata,
    },
  });

  if (analysis.suggestedAction) {
    const mentionedAssignees = analysis.mentionedUserIds;
    if (mentionedAssignees.length > 0) {
      for (const userId of mentionedAssignees) {
        await prisma.nextStep.create({
          data: {
            tenantId,
            communicationId: communication.id,
            title: "Respond — you were @mentioned",
            priority: analysis.priority,
            status: "OPEN",
            assigneeId: userId,
          },
        });
      }
    } else {
      await prisma.nextStep.create({
        data: {
          tenantId,
          communicationId: communication.id,
          title: analysis.suggestedAction,
          priority: analysis.priority,
          status: "OPEN",
        },
      });
    }
  }

  return { created: true, id: communication.id };
}

export async function syncWebexMessages(tenantId: string): Promise<{
  fetched: number;
  ingested: number;
  updated: number;
}> {
  const allowlist = await getActiveWebexAllowlist(tenantId);
  if (allowlist.length === 0) {
    return { fetched: 0, ingested: 0, updated: 0 };
  }

  const accessToken = await getWebexAccessToken(tenantId);
  if (!accessToken) {
    throw new Error("Webex not connected");
  }

  const messages = await fetchAllowlistedMessages(accessToken, allowlist);
  const teamMembers = await getTenantMembers(tenantId);
  const spaceByRoomId = new Map(
    allowlist.map((entry) => [entry.spaceId, entry])
  );
  let ingested = 0;
  let updated = 0;

  for (const message of messages) {
    try {
      const entry = spaceByRoomId.get(message.roomId);
      const result = await ingestWebexMessage(
        tenantId,
        message,
        entry?.id,
        teamMembers,
        entry
          ? {
              purpose: entry.purpose ?? "PRIORITIES",
              spaceTitle: entry.spaceTitle,
              technologyLabel: entry.technologyLabel,
            }
          : undefined
      );
      if (result.created) ingested++;
      else updated++;
    } catch (err) {
      console.error(`Failed to ingest Webex message ${message.id}:`, err);
      updated++;
    }
  }

  return { fetched: messages.length, ingested, updated };
}

export async function registerWebexWebhooks(tenantId: string): Promise<string[]> {
  const allowlist = await getActiveWebexAllowlist(tenantId);
  if (allowlist.length === 0) {
    throw new Error("No active Webex allowlist configured");
  }

  const accessToken = await getWebexAccessToken(tenantId);
  if (!accessToken) {
    throw new Error("Webex not connected");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL required for webhook registration");
  }

  const targetUrl = `${appUrl}/api/integrations/webex/webhook`;
  const secret = process.env.WEBEX_WEBHOOK_SECRET;
  const webhookIds: string[] = [];

  for (const entry of allowlist) {
    const webhook = await createMessageWebhook(
      accessToken,
      targetUrl,
      entry.spaceId,
      `next-${tenantId}-${entry.spaceId}`,
      secret
    );
    webhookIds.push(webhook.id);
  }

  await prisma.integrationToken.update({
    where: {
      tenantId_provider: { tenantId, provider: "WEBEX" },
    },
    data: {
      metadata: { webhookIds, targetUrl },
    },
  });

  return webhookIds;
}
