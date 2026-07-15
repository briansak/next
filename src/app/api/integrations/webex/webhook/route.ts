import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getActiveWebexAllowlist,
  ingestWebexMessage,
  isAllowlistedSpace,
} from "@/lib/integrations/webex/ingest";
import type { WebexWebhookPayload } from "@/lib/integrations/webex";

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha1", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-spark-signature");
  const secret = process.env.WEBEX_WEBHOOK_SECRET;

  if (secret && !verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebexWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebexWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.resource !== "messages" || payload.event !== "created") {
    return NextResponse.json({ ok: true, skipped: "not a message created event" });
  }

  const roomId = payload.data?.roomId;
  const messageId = payload.data?.id;
  const text = payload.data?.text;

  if (!roomId || !messageId) {
    return NextResponse.json({ ok: true, skipped: "incomplete message data" });
  }

  const messageText = text?.trim() || undefined;

  // Find tenant with active WEBEX policy containing this space
  const allowlistEntries = await prisma.webexSpaceAllowlist.findMany({
    where: {
      spaceId: roomId,
      policy: { source: "WEBEX", status: "ACTIVE" },
    },
    include: { policy: true },
  });

  if (allowlistEntries.length === 0) {
    return NextResponse.json({ ok: true, skipped: "space not allowlisted" });
  }

  const entry = allowlistEntries[0];
  const tenantId = entry.policy.tenantId;

  const allowlist = await getActiveWebexAllowlist(tenantId);
  if (!isAllowlistedSpace(allowlist, roomId)) {
    return NextResponse.json({ ok: true, skipped: "policy inactive" });
  }

  const result = await ingestWebexMessage(
    tenantId,
    {
      id: messageId,
      roomId,
      personEmail: payload.data.personEmail ?? "",
      personDisplayName: "",
      text: messageText ?? "[Empty message]",
      created: payload.data.created ?? new Date().toISOString(),
      parentId: payload.data.parentId,
    },
    entry.id,
    undefined,
    {
      purpose: entry.purpose,
      spaceTitle: entry.spaceTitle ?? undefined,
      technologyLabel: entry.technologyLabel ?? undefined,
    }
  );

  return NextResponse.json({ ok: true, ingested: result.created, id: result.id });
}
