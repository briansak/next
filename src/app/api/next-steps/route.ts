import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { defaultPrepDueDate } from "@/lib/heuristics/event-prep-suggestions";
const createSchema = z.object({
  communicationId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { communicationId, title } = parsed.data;

  const communication = await prisma.communication.findFirst({
    where: {
      id: communicationId,
      source: "OUTLOOK_CALENDAR",
      receivedAt: { gt: new Date() },
    },
    select: {
      id: true,
      subject: true,
      receivedAt: true,
      priority: true,
    },
  });

  if (!communication) {
    return NextResponse.json(
      { error: "Upcoming event not found" },
      { status: 404 }
    );
  }

  const duplicate = await prisma.nextStep.findFirst({
    where: {
      communicationId,
      title: { equals: title, mode: "insensitive" },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { id: true, title: true, status: true },
  });

  if (duplicate) {
    return NextResponse.json({ ok: true, nextStep: duplicate, duplicate: true });
  }

  const nextStep = await prisma.nextStep.create({
    data: {
      communicationId,
      title,
      status: "OPEN",
      priority: communication.priority,
      dueAt: defaultPrepDueDate(communication.receivedAt),
      assigneeId: session.userId,
      createdById: session.userId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      communicationId: true,
    },
  });

  return NextResponse.json({
    ok: true,
    nextStep,
    eventSubject: communication.subject,
  });
}
