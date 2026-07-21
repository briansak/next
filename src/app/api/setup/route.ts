import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { updateAppConfig } from "@/lib/config/app-config-store";
import {
  normalizePartnerDomain,
  normalizePartnerSubjectPrefix,
} from "@/lib/integrations/email/partner-rules";
import { restartIngestionPoller } from "@/lib/ingestion/poll";
import { isWebexConfigured } from "@/lib/integrations/webex/config-store";
import { getLocalUser, LOCAL_USER_EMAIL } from "@/lib/user/onboarding";

const initializeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  partnerName: z.string().trim().min(2).max(120),
});

const completeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  partnerName: z.string().trim().min(2).max(120),
  emailDomains: z.array(z.string()).default([]),
  subjectPrefixes: z.array(z.string()).default([]),
  partnerAskSlaHours: z.number().int().min(1).max(720).default(48),
  ollamaBaseUrl: z.string().trim().max(512).nullable().optional(),
  ollamaModel: z.string().trim().min(1).max(128).nullable().optional(),
  enableIngestionPoll: z.boolean().optional(),
  allowOllamaSummaries: z.boolean().optional(),
  enableMeetingOllamaSummary: z.boolean().optional(),
  enableGongEmailCorrelation: z.boolean().optional(),
  enableAppleMailImport: z.boolean().optional(),
  enableAppleCalendarImport: z.boolean().optional(),
  appleCalendarNames: z.string().trim().max(512).nullable().optional(),
});

async function getOrCreateEmailPolicy() {
  const existing = await prisma.ingestionPolicy.findUnique({
    where: { source: "EMAIL" },
    include: { emailAllowlists: true },
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
    include: { emailAllowlists: true },
  });
}

async function upsertDraftUser(name: string, partnerName: string) {
  const existing = await getLocalUser();

  if (existing?.onboardingComplete) {
    return { error: "Setup is already complete", status: 409 as const };
  }

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { name, partnerName },
      select: { id: true, onboardingComplete: true },
    });
    return { user, status: 200 as const };
  }

  const user = await prisma.user.create({
    data: {
      email: LOCAL_USER_EMAIL,
      name,
      partnerName,
      onboardingComplete: false,
    },
    select: { id: true, onboardingComplete: true },
  });

  return { user, status: 201 as const };
}

async function syncPartnerEmailRules(
  policyId: string,
  emailDomains: string[],
  subjectPrefixes: string[]
) {
  await prisma.emailAllowlist.deleteMany({ where: { policyId } });

  const rows: Array<{
    policyId: string;
    fromDomain?: string;
    subjectPrefix?: string;
  }> = [];

  for (const raw of emailDomains) {
    const domain = normalizePartnerDomain(raw);
    if (domain) rows.push({ policyId, fromDomain: domain });
  }

  for (const raw of subjectPrefixes) {
    const prefix = normalizePartnerSubjectPrefix(raw);
    if (prefix) rows.push({ policyId, subjectPrefix: prefix });
  }

  if (rows.length > 0) {
    await prisma.emailAllowlist.createMany({ data: rows });
  }
}

export async function GET() {
  const user = await getLocalUser();

  return NextResponse.json({
    complete: user?.onboardingComplete ?? false,
    draft: user
      ? {
          name: user.name,
          partnerName: user.partnerName,
        }
      : null,
    webexConfigured: await isWebexConfigured(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : null;

  if (action === "initialize") {
    const parsed = initializeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await upsertDraftUser(parsed.data.name, parsed.data.partnerName);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, userId: result.user.id }, { status: result.status });
  }

  if (action === "complete") {
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const existing = await getLocalUser();
    if (existing?.onboardingComplete) {
      return NextResponse.json({ error: "Setup is already complete" }, { status: 409 });
    }

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: parsed.data.name,
            partnerName: parsed.data.partnerName,
            allowOllamaSummaries: parsed.data.allowOllamaSummaries ?? false,
            onboardingComplete: true,
          },
        })
      : await prisma.user.create({
          data: {
            email: LOCAL_USER_EMAIL,
            name: parsed.data.name,
            partnerName: parsed.data.partnerName,
            allowOllamaSummaries: parsed.data.allowOllamaSummaries ?? false,
            onboardingComplete: true,
          },
        });

    await updateAppConfig(user.id, {
      partnerAskSlaHours: parsed.data.partnerAskSlaHours,
      ollamaBaseUrl: parsed.data.ollamaBaseUrl ?? null,
      ollamaModel: parsed.data.ollamaModel ?? undefined,
      enableIngestionPoll: parsed.data.enableIngestionPoll,
      enableMeetingOllamaSummary: parsed.data.enableMeetingOllamaSummary,
      enableGongEmailCorrelation: parsed.data.enableGongEmailCorrelation,
      enableAppleMailImport: parsed.data.enableAppleMailImport,
      enableAppleCalendarImport: parsed.data.enableAppleCalendarImport,
      appleCalendarNames: parsed.data.appleCalendarNames ?? null,
    });

    const emailPolicy = await getOrCreateEmailPolicy();
    await syncPartnerEmailRules(
      emailPolicy.id,
      parsed.data.emailDomains,
      parsed.data.subjectPrefixes
    );

    await restartIngestionPoller();

    return NextResponse.json({ ok: true, redirect: "/dashboard" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
