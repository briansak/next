import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  getMicrosoft365Config,
  getMicrosoft365OAuthUrl,
} from "@/lib/integrations/microsoft365";
import { requireAdmin } from "@/lib/tenant";

export async function GET() {
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
    redirect("/settings/ingestion?error=forbidden");
  }

  const config = getMicrosoft365Config();
  if (!config) {
    redirect("/settings/ingestion?error=microsoft_not_configured");
  }

  const state = Buffer.from(
    JSON.stringify({ tenantId: session.tenantId, userId: session.userId })
  ).toString("base64url");

  const oauthUrl = getMicrosoft365OAuthUrl(config, state, {
    loginHint: process.env.MICROSOFT_LOGIN_HINT?.trim() || undefined,
  });
  return NextResponse.redirect(oauthUrl);
}
