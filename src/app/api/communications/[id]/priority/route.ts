import { NextResponse } from "next/server";
import { z } from "zod";
import type { Priority, Prisma } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildViewerOverride,
  mergeViewerOverrideMetadata,
} from "@/lib/communications/viewer-override";
import { meetingVisibleToUser } from "@/lib/integrations/webex/meetings";
import { scopedToTenant } from "@/lib/tenant";

const bodySchema = z
  .object({
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]).optional(),
    hidden: z.boolean().optional(),
    reset: z.boolean().optional(),
  })
  .refine(
    (value) => value.reset || value.priority !== undefined || value.hidden !== undefined,
    { message: "Provide priority, hidden, or reset" }
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const communication = await prisma.communication.findFirst({
    where: {
      id,
      ...scopedToTenant(session.tenantId),
    },
  });

  if (!communication) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (communication.source === "WEBEX_MEETING") {
    const visible = meetingVisibleToUser(
      (communication.metadata ?? {}) as {
        relevantUserEmails?: string[];
        connectedAccountEmails?: string[];
        inviteeEmails?: string[];
        participantEmails?: string[];
        hostEmail?: string;
      },
      session.email.toLowerCase(),
      session.role === "ADMIN"
    );
    if (!visible) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  let override = null;
  if (!parsed.data.reset) {
    const existing = ((communication.metadata ?? {}) as {
      viewerOverrides?: Record<
        string,
        { priority: Priority; hidden?: boolean }
      >;
    }).viewerOverrides?.[session.userId];

    const priority =
      parsed.data.priority ?? existing?.priority ?? communication.priority;
    const hidden =
      parsed.data.hidden !== undefined
        ? parsed.data.hidden
        : existing?.hidden;

    override = buildViewerOverride(priority, { hidden });
  }

  const metadata = mergeViewerOverrideMetadata(
    communication.metadata,
    session.userId,
    override
  );

  await prisma.communication.update({
    where: { id },
    data: {
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    override,
    cleared: parsed.data.reset === true,
  });
}
