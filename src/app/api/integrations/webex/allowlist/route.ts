import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
const bodySchema = z.object({
  spaceId: z.string().min(1),
  spaceTitle: z.string().optional(),
  action: z.enum(["add", "remove"]),
  purpose: z.enum(["PRIORITIES", "DEAL", "TECHNOLOGY"]).optional(),
  technologyLabel: z.string().max(80).optional(),
  dealLabel: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
      } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const {
    spaceId,
    spaceTitle,
    action,
    purpose = "PRIORITIES",
    technologyLabel,
    dealLabel,
  } = parsed.data;

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
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
        dealLabel: purpose === "DEAL" ? dealLabel?.trim() || null : null,
      },
      create: {
        policyId: policy.id,
        spaceId,
        spaceTitle: spaceTitle ?? null,
        purpose,
        technologyLabel:
          purpose === "TECHNOLOGY" ? technologyLabel?.trim() || null : null,
        dealLabel: purpose === "DEAL" ? dealLabel?.trim() || null : null,
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
    purposeParam === "PRIORITIES" ||
    purposeParam === "DEAL" ||
    purposeParam === "TECHNOLOGY"
      ? purposeParam
      : undefined;

  const policy = await prisma.ingestionPolicy.findFirst({
    where: {
      source: "WEBEX",
    },
    include: {
      webexAllowlists: {
        where: purposeFilter ? { purpose: purposeFilter } : undefined,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const allowlist = policy?.webexAllowlists ?? [];
  const dedupedAllowlist = dedupeAllowlistBySpaceId(allowlist);

  return NextResponse.json({
    policyId: policy?.id ?? null,
    status: policy?.status ?? null,
    allowlist: dedupedAllowlist,
  });
}

function dedupeAllowlistBySpaceId<
  T extends { id: string; spaceId: string; createdAt?: Date }
>(entries: T[]): T[] {
  const bySpaceId = new Map<string, T>();
  for (const entry of entries) {
    const existing = bySpaceId.get(entry.spaceId);
    if (!existing) {
      bySpaceId.set(entry.spaceId, entry);
      continue;
    }
    const existingTime = existing.createdAt?.getTime() ?? 0;
    const nextTime = entry.createdAt?.getTime() ?? 0;
    if (nextTime >= existingTime) {
      bySpaceId.set(entry.spaceId, entry);
    }
  }
  return [...bySpaceId.values()];
}
