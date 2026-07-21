import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  formatPartnerRuleLabel,
  parsePartnerRuleInput,
} from "@/lib/integrations/email/partner-rules";

const addSchema = z.object({
  kind: z.enum(["domain", "subjectPrefix", "address"]),
  value: z.string().trim().min(1).max(120),
});

async function getOrCreateEmailPolicy() {
  const existing = await prisma.ingestionPolicy.findUnique({
    where: { source: "EMAIL" },
    include: { emailAllowlists: { orderBy: { createdAt: "asc" } } },
  });

  if (existing) return existing;

  return prisma.ingestionPolicy.create({
    data: {
      source: "EMAIL",
      name: "Partner email",
      status: "DRAFT",
      description:
        "Partner coverage rules boost priority on My Priorities and partner asks.",
    },
    include: { emailAllowlists: { orderBy: { createdAt: "asc" } } },
  });
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await prisma.ingestionPolicy.findUnique({
    where: { source: "EMAIL" },
    include: { emailAllowlists: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({
    policyId: policy?.id ?? null,
    status: policy?.status ?? null,
    rules:
      policy?.emailAllowlists.map((rule) => ({
        id: rule.id,
        fromDomain: rule.fromDomain,
        fromAddress: rule.fromAddress,
        subjectPrefix: rule.subjectPrefix,
        label: formatPartnerRuleLabel(rule),
      })) ?? [],
  });
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ruleInput = parsePartnerRuleInput(parsed.data);
  if (!ruleInput) {
    return NextResponse.json({ error: "Invalid partner rule value" }, { status: 400 });
  }

  const policy = await getOrCreateEmailPolicy();

  const data =
    ruleInput.kind === "domain"
      ? { fromDomain: ruleInput.value, fromAddress: null, subjectPrefix: null }
      : ruleInput.kind === "address"
        ? { fromAddress: ruleInput.value, fromDomain: null, subjectPrefix: null }
        : { subjectPrefix: ruleInput.value, fromDomain: null, fromAddress: null };

  const duplicate = policy.emailAllowlists.some((rule) => {
    if (data.fromDomain) {
      return rule.fromDomain?.toLowerCase() === data.fromDomain.toLowerCase();
    }
    if (data.fromAddress) {
      return rule.fromAddress?.toLowerCase() === data.fromAddress.toLowerCase();
    }
    return rule.subjectPrefix === data.subjectPrefix;
  });

  if (duplicate) {
    return NextResponse.json({ error: "That partner rule already exists" }, { status: 409 });
  }

  const rule = await prisma.emailAllowlist.create({
    data: {
      policyId: policy.id,
      ...data,
    },
  });

  return NextResponse.json({
    ok: true,
    rule: {
      id: rule.id,
      fromDomain: rule.fromDomain,
      fromAddress: rule.fromAddress,
      subjectPrefix: rule.subjectPrefix,
      label: formatPartnerRuleLabel(rule),
    },
  });
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ruleId = new URL(request.url).searchParams.get("id")?.trim();
  if (!ruleId) {
    return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
  }

  const policy = await prisma.ingestionPolicy.findUnique({
    where: { source: "EMAIL" },
    select: { id: true },
  });

  if (!policy) {
    return NextResponse.json({ error: "No email policy found" }, { status: 404 });
  }

  const deleted = await prisma.emailAllowlist.deleteMany({
    where: { id: ruleId, policyId: policy.id },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, removed: ruleId });
}
