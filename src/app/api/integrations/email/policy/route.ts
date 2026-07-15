import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";

export async function POST() {
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

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      tenantId: session.tenantId,
      source: "EMAIL",
    },
  });

  if (!policy) {
    return NextResponse.json({ error: "No email policy found" }, { status: 404 });
  }

  await prisma.ingestionPolicy.update({
    where: { id: policy.id },
    data: { status: "ACTIVE" },
  });

  return NextResponse.json({ ok: true, policyId: policy.id, status: "ACTIVE" });
}
