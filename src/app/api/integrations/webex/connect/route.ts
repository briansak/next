import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getLocalUserId } from "@/lib/user/onboarding";
import { getWebexOAuthUrl } from "@/lib/integrations/webex";
import {
  getWebexConfig,
  getWebexScopes,
} from "@/lib/integrations/webex/config-store";

export async function GET() {
  const session = await getAuthSession();
  const userId = session?.userId ?? (await getLocalUserId());
  if (!userId) {
    redirect("/setup");
  }

  const config = await getWebexConfig();
  if (!config) {
    redirect("/settings/webex?error=webex_not_configured");
  }

  const scopes = await getWebexScopes();
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  const oauthUrl = getWebexOAuthUrl(config, state, scopes);
  return NextResponse.redirect(oauthUrl);
}
