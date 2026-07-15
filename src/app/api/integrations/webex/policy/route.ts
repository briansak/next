import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin, scopedToTenant } from "@/lib/tenant";

const bodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]),
});

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      ...scopedToTenant(session.tenantId),
      source: "WEBEX",
    },
    include: { webexAllowlists: true },
  });

  if (!policy) {
    return NextResponse.json({ error: "Webex policy not found" }, { status: 404 });
  }

  if (parsed.data.status === "ACTIVE" && policy.webexAllowlists.length === 0) {
    return NextResponse.json(
      { error: "Add at least one space before activating" },
      { status: 400 }
    );
  }

  const updated = await prisma.ingestionPolicy.update({
    where: { id: policy.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
