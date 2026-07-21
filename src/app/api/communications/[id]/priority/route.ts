import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type Priority } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addDashboardHiddenCommunicationId,
  buildViewerOverride,
  mergeViewerOverrideMetadata,
  parseDashboardHiddenCommunicationIds,
  removeDashboardHiddenCommunicationId,
} from "@/lib/communications/viewer-override";
import { meetingVisibleToUser } from "@/lib/integrations/webex/meetings";

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
    where: { id },
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
      true
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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { dashboardHiddenCommunicationIds: true },
  });

  let hiddenCommunicationIds = parseDashboardHiddenCommunicationIds(
    user?.dashboardHiddenCommunicationIds
  );

  if (parsed.data.reset) {
    hiddenCommunicationIds = removeDashboardHiddenCommunicationId(
      hiddenCommunicationIds,
      id
    );
  } else if (override?.hidden) {
    hiddenCommunicationIds = addDashboardHiddenCommunicationId(
      hiddenCommunicationIds,
      id
    );
  } else {
    hiddenCommunicationIds = removeDashboardHiddenCommunicationId(
      hiddenCommunicationIds,
      id
    );
  }

  await prisma.$transaction([
    prisma.communication.update({
      where: { id },
      data: {
        metadata: metadata as Prisma.InputJsonValue,
      },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: {
        dashboardHiddenCommunicationIds:
          hiddenCommunicationIds.length > 0 ? hiddenCommunicationIds : Prisma.DbNull,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    override,
    cleared: parsed.data.reset === true,
  });
}
