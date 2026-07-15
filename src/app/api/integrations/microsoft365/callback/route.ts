import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  exchangeMicrosoft365Code,
  getMicrosoft365Config,
  getMicrosoft365User,
} from "@/lib/integrations/microsoft365";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
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

  const config = getMicrosoft365Config();
  if (!config) {
    return NextResponse.json(
      { error: "Microsoft 365 not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const state = url.searchParams.get("state");

  if (error) {
    const detail = errorDescription
      ? `&detail=${encodeURIComponent(errorDescription)}`
      : "";
    redirect(`/settings/ingestion?error=microsoft_auth_denied${detail}`);
  }

  if (state) {
    try {
      const parsed = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      ) as { tenantId?: string };
      if (parsed.tenantId && parsed.tenantId !== session.tenantId) {
        redirect("/settings/ingestion?error=microsoft_auth_denied");
      }
    } catch {
      redirect("/settings/ingestion?error=microsoft_auth_denied");
    }
  }

  if (!code) {
    redirect("/settings/ingestion");
  }

  let tokens;
  try {
    tokens = await exchangeMicrosoft365Code(config, code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    redirect(
      `/settings/ingestion?error=microsoft_token_failed&detail=${encodeURIComponent(message)}`
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
  const profile = await getMicrosoft365User(tokens.accessToken);
  const connectedAs =
    profile?.mail ?? profile?.userPrincipalName ?? profile?.displayName ?? null;

  const metadata = {
    sharedMailbox: process.env.MICROSOFT_SHARED_MAILBOX ?? null,
    connectedAs,
    connectedAt: new Date().toISOString(),
  };

  await prisma.integrationToken.upsert({
    where: {
      tenantId_provider: {
        tenantId: session.tenantId,
        provider: "MICROSOFT365",
      },
    },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      metadata,
    },
    create: {
      tenantId: session.tenantId,
      provider: "MICROSOFT365",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      metadata,
    },
  });

  redirect("/settings/ingestion?connected=microsoft365");
}
