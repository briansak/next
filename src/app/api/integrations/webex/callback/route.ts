import { NextResponse } from "next/server";
import {
  exchangeWebexCode,
} from "@/lib/integrations/webex";
import {
  getWebexConfig,
  getWebexScopes,
} from "@/lib/integrations/webex/config-store";
import { prisma } from "@/lib/db";
import { invalidateCachedWebexSpaces } from "@/lib/integrations/webex/spaces-cache";

function redirectTarget(onboardingComplete: boolean, params: URLSearchParams) {
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return onboardingComplete ? `/settings/webex${suffix}` : `/setup${suffix}`;
}

export async function GET(request: Request) {
  const config = await getWebexConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/setup?error=webex_not_configured", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const stateRaw = url.searchParams.get("state");

  let onboardingComplete = false;

  if (stateRaw) {
    try {
      const state = JSON.parse(
        Buffer.from(stateRaw, "base64url").toString("utf8")
      ) as { userId?: string };
      if (state.userId) {
        const user = await prisma.user.findUnique({
          where: { id: state.userId },
          select: { onboardingComplete: true },
        });
        onboardingComplete = user?.onboardingComplete ?? false;
      }
    } catch {
      // Ignore malformed state; fall back to setup redirect.
    }
  }

  if (error) {
    const params = new URLSearchParams({
      error:
        error === "invalid_scope" ? "webex_invalid_scope" : "webex_auth_denied",
    });
    if (errorDescription) params.set("detail", errorDescription);
    return NextResponse.redirect(
      new URL(redirectTarget(onboardingComplete, params), request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(redirectTarget(onboardingComplete, new URLSearchParams()), request.url)
    );
  }

  const scopes = await getWebexScopes();
  const tokens = await exchangeWebexCode(config, code, scopes);
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

  return NextResponse.redirect(
    new URL(
      redirectTarget(onboardingComplete, new URLSearchParams({ connected: "webex" })),
      request.url
    )
  );
}
