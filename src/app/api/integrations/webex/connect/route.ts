import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getWebexConfig, getWebexOAuthUrl } from "@/lib/integrations/webex";
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

  const config = getWebexConfig();
  if (!config) {
    redirect("/settings/ingestion?error=webex_not_configured");
  }

  const state = Buffer.from(
    JSON.stringify({ tenantId: session.tenantId, userId: session.userId })
  ).toString("base64url");

  const oauthUrl = getWebexOAuthUrl(config, state);
  return NextResponse.redirect(oauthUrl);
}
