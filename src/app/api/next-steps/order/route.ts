import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const orderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).max(50),
});

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { orderedIds } = parsed.data;
  const uniqueIds = [...new Set(orderedIds)];

  const visibleSteps = await prisma.nextStep.findMany({
    where: {
      id: { in: uniqueIds },
      status: { in: ["OPEN", "IN_PROGRESS"] },
      OR: [{ assigneeId: session.userId }, { assigneeId: null }],
    },
    select: { id: true },
  });

  const visibleIds = new Set(visibleSteps.map((step) => step.id));
  const sanitizedOrder = uniqueIds.filter((id) => visibleIds.has(id));

  if (sanitizedOrder.length === 0) {
    return NextResponse.json({ error: "No valid next steps" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        nextStepOrder: sanitizedOrder,
      },
    });
  } catch (error) {
    console.error("[next-steps/order] failed to persist order", error);
    return NextResponse.json(
      { error: "Could not save order. Run npm run db:push if this is a new install." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, orderedIds: sanitizedOrder });
}
