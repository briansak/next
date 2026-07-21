import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getWebexConfig, getWebexOAuthUrl } from "@/lib/integrations/webex";
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }
  const config = getWebexConfig();
  if (!config) {
    redirect("/settings/webex?error=webex_not_configured");
  }

  const state = Buffer.from(
    JSON.stringify({ userId: session.userId })
  ).toString("base64url");

  const oauthUrl = getWebexOAuthUrl(config, state);
  return NextResponse.redirect(oauthUrl);
}
