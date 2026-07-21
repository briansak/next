import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
const updateSchema = z.object({
  status: z.enum(["FULFILLED", "DISMISSED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.commitment.findFirst({
    where: {
      id,
      },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  const commitment = await prisma.commitment.update({
    where: { id },
    data: { status: parsed.data.status },
    select: {
      id: true,
      title: true,
      status: true,
      owner: true,
    },
  });

  return NextResponse.json({ ok: true, commitment });
}
