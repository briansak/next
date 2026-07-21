import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { exchangeWebexCode, getWebexConfig } from "@/lib/integrations/webex";
import { prisma } from "@/lib/db";
import { invalidateCachedWebexSpaces } from "@/lib/integrations/webex/spaces-cache";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const config = getWebexConfig();
  if (!config) {
    redirect("/settings/webex?error=webex_not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const params = new URLSearchParams({
      error:
        error === "invalid_scope" ? "webex_invalid_scope" : "webex_auth_denied",
    });
    if (errorDescription) params.set("detail", errorDescription);
    redirect(`/settings/webex?${params.toString()}`);
  }

  if (!code) {
    redirect("/settings/webex");
  }

  const tokens = await exchangeWebexCode(config, code);
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  await prisma.integrationToken.upsert({
    where: { provider: "WEBEX" },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    },
    create: {
      provider: "WEBEX",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    },
  });

  invalidateCachedWebexSpaces();

  redirect("/settings/webex?connected=webex");
}
