import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
export async function POST() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
      } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
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
