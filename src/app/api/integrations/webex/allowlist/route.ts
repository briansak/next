import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin, scopedToTenant } from "@/lib/tenant";

const bodySchema = z.object({
  spaceId: z.string().min(1),
  spaceTitle: z.string().optional(),
  action: z.enum(["add", "remove"]),
  purpose: z.enum(["PRIORITIES", "TECHNOLOGY"]).optional(),
  technologyLabel: z.string().max(80).optional(),
});

export async function POST(request: Request) {
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

  const { spaceId, spaceTitle, action, purpose = "PRIORITIES", technologyLabel } =
    parsed.data;

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

  if (action === "add") {
    const entry = await prisma.webexSpaceAllowlist.upsert({
      where: {
        policyId_spaceId: { policyId: policy.id, spaceId },
      },
      update: {
        spaceTitle: spaceTitle ?? undefined,
        purpose,
        technologyLabel:
          purpose === "TECHNOLOGY" ? technologyLabel?.trim() || null : null,
      },
      create: {
        policyId: policy.id,
        spaceId,
        spaceTitle: spaceTitle ?? null,
        purpose,
        technologyLabel:
          purpose === "TECHNOLOGY" ? technologyLabel?.trim() || null : null,
      },
    });
    return NextResponse.json({ ok: true, entry });
  }

  await prisma.webexSpaceAllowlist.deleteMany({
    where: { policyId: policy.id, spaceId },
  });

  return NextResponse.json({ ok: true, removed: spaceId });
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purposeParam = new URL(request.url).searchParams.get("purpose");
  const purposeFilter =
    purposeParam === "PRIORITIES" || purposeParam === "TECHNOLOGY"
      ? purposeParam
      : undefined;

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      ...scopedToTenant(session.tenantId),
      source: "WEBEX",
    },
    include: {
      webexAllowlists: {
        where: purposeFilter ? { purpose: purposeFilter } : undefined,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    policyId: policy?.id ?? null,
    status: policy?.status ?? null,
    allowlist: policy?.webexAllowlists ?? [],
  });
}
