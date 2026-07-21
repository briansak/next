import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseManualNextStep } from "@/lib/heuristics/parse-manual-next-step";
import { getCurrentUserForMentions } from "@/lib/user/profile";

const bodySchema = z.object({
  details: z.string().trim().min(10).max(8000),
  preview: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const teamMembers = await getCurrentUserForMentions(session.userId);
  const viewer = teamMembers.find((member) => member.id === session.userId);
  const extracted = parseManualNextStep(parsed.data.details, {
    teamMembers,
    viewer,
  });

  if (parsed.data.preview) {
    return NextResponse.json({
      ok: true,
      preview: {
        title: extracted.title,
        summary: extracted.summary,
        priority: extracted.priority,
        priorityReasons: extracted.priorityReasons,
        dueAt: extracted.dueAt?.toISOString() ?? null,
        suggestedAction: extracted.suggestedAction ?? null,
      },
    });
  }

  const nextStep = await prisma.nextStep.create({
    data: {
      title: extracted.title,
      description: extracted.summary,
      status: "OPEN",
      priority: extracted.priority,
      dueAt: extracted.dueAt,
      assigneeId: session.userId,
      createdById: session.userId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      communicationId: true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { nextStepOrder: true },
  });

  const existingOrder = Array.isArray(user?.nextStepOrder)
    ? user.nextStepOrder.filter(
        (id): id is string => typeof id === "string"
      )
    : [];

  const newOrder = [
    nextStep.id,
    ...existingOrder.filter((id) => id !== nextStep.id),
  ].slice(0, 50);

  await prisma.user.update({
    where: { id: session.userId },
    data: { nextStepOrder: newOrder },
  });

  return NextResponse.json({
    ok: true,
    nextStep: {
      ...nextStep,
      dueAt: nextStep.dueAt?.toISOString() ?? null,
    },
    parsed: {
      priorityReasons: extracted.priorityReasons,
      tags: extracted.tags,
    },
  });
}
