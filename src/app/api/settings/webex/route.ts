import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { updateAppConfig } from "@/lib/config/app-config-store";
import {
  getWebexSettingsView,
  WEBEX_SCOPE_PRESETS,
} from "@/lib/integrations/webex/config-store";
import { updateSecrets } from "@/lib/secrets/store";

const scopeModes = [
  "standard",
  "standard+meetings",
  "standard+meetings+vidcast",
  "compliance",
  "standard+webhooks",
  "compliance+webhooks",
  "custom",
] as const;

const patchWebexSettingsSchema = z
  .object({
    clientId: z.string().trim().max(512).nullable().optional(),
    clientSecret: z.string().trim().max(512).nullable().optional(),
    webhookSecret: z.string().trim().max(512).nullable().optional(),
    scopeMode: z.enum(scopeModes).optional(),
    customScopes: z.string().trim().max(2048).nullable().optional(),
    redirectUri: z
      .string()
      .trim()
      .max(512)
      .nullable()
      .optional()
      .refine(
        (value) =>
          value == null ||
          value === "" ||
          /^https?:\/\/.+/i.test(value),
        "Redirect URI must start with http:// or https://"
      ),
    mcpUrl: z
      .string()
      .trim()
      .max(512)
      .nullable()
      .optional()
      .refine(
        (value) =>
          value == null ||
          value === "" ||
          /^https?:\/\/.+/i.test(value),
        "MCP URL must start with http:// or https://"
      ),
    appPublicUrl: z
      .string()
      .trim()
      .max(512)
      .nullable()
      .optional()
      .refine(
        (value) =>
          value == null ||
          value === "" ||
          /^https?:\/\/.+/i.test(value),
        "App URL must start with http:// or https://"
      ),
  })
  .strict();

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getWebexSettingsView();
  return NextResponse.json({ settings, scopePresets: Object.keys(WEBEX_SCOPE_PRESETS) });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchWebexSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const patch = parsed.data;

  try {
    if (
      patch.clientId !== undefined ||
      patch.clientSecret !== undefined ||
      patch.webhookSecret !== undefined
    ) {
      await updateSecrets({
        webexClientId: patch.clientId,
        webexClientSecret: patch.clientSecret,
        webexWebhookSecret: patch.webhookSecret,
      });
    }

    const configPatch: Record<string, unknown> = {};
    if (patch.scopeMode !== undefined) {
      configPatch.webexScopeMode = patch.scopeMode;
    }
    if (patch.customScopes !== undefined) {
      configPatch.webexCustomScopes = patch.customScopes;
    }
    if (patch.redirectUri !== undefined) {
      configPatch.webexRedirectUri = patch.redirectUri;
    }
    if (patch.mcpUrl !== undefined) {
      configPatch.webexMcpUrl = patch.mcpUrl;
    }
    if (patch.appPublicUrl !== undefined) {
      configPatch.appPublicUrl = patch.appPublicUrl;
    }

    if (Object.keys(configPatch).length > 0) {
      await updateAppConfig(session.userId, configPatch);
    }

    const settings = await getWebexSettingsView();
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save Webex settings" },
      { status: 500 }
    );
  }
}
