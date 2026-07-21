import {
  defaultWebexRedirectUri,
  type ResolvedAppConfig,
} from "@/lib/config/app-config";
import { getAppConfig } from "@/lib/config/app-config-store";
import { getFirstUserId } from "@/lib/user/profile";
import {
  getSecret,
  getSecretStatus,
  migrateSecretsFromEnv,
  type SecretStatus,
} from "@/lib/secrets/store";
import {
  getWebexScopeModeFromConfig,
  getWebexScopesFromConfig,
  type WebexConfig,
  WEBEX_SCOPE_PRESETS,
  type WebexScopeMode,
} from "./index";

export interface WebexSettingsView extends SecretStatus {
  configured: boolean;
  scopeMode: string;
  scopes: string;
  redirectUri: string;
  mcpUrl: string | null;
  appPublicUrl: string;
}

export interface WebexSettingsPatch {
  clientId?: string | null;
  clientSecret?: string | null;
  webhookSecret?: string | null;
  scopeMode?: WebexScopeMode | "custom";
  customScopes?: string | null;
  redirectUri?: string | null;
  mcpUrl?: string | null;
  appPublicUrl?: string | null;
}

async function loadResolvedAppConfig(): Promise<ResolvedAppConfig> {
  const userId = await getFirstUserId();
  if (!userId) {
    const { resolveAppConfig } = await import("@/lib/config/app-config");
    return resolveAppConfig(null);
  }
  return getAppConfig(userId);
}

export async function isWebexConfigured(): Promise<boolean> {
  await migrateSecretsFromEnv();
  const clientId = await getSecret("webexClientId");
  const clientSecret = await getSecret("webexClientSecret");
  if (!clientId || !clientSecret) return false;

  const config = await loadResolvedAppConfig();
  return Boolean(resolveWebexRedirectUri(config));
}

export function resolveWebexRedirectUri(config: ResolvedAppConfig): string {
  return config.webexRedirectUri ?? defaultWebexRedirectUri(config.appPublicUrl);
}

export async function getWebexConfig(): Promise<WebexConfig | null> {
  await migrateSecretsFromEnv();

  const clientId = await getSecret("webexClientId");
  const clientSecret = await getSecret("webexClientSecret");
  if (!clientId || !clientSecret) return null;

  const appConfig = await loadResolvedAppConfig();
  const redirectUri = resolveWebexRedirectUri(appConfig);
  if (!redirectUri) return null;

  return { clientId, clientSecret, redirectUri };
}

export async function getWebexScopes(): Promise<string> {
  const config = await loadResolvedAppConfig();
  return getWebexScopesFromConfig(config);
}

export async function getWebexScopeMode(): Promise<string> {
  const config = await loadResolvedAppConfig();
  return getWebexScopeModeFromConfig(config);
}

export async function getWebexWebhookSecret(): Promise<string | null> {
  await migrateSecretsFromEnv();
  return getSecret("webexWebhookSecret");
}

export async function getAppPublicUrl(): Promise<string> {
  const config = await loadResolvedAppConfig();
  return config.appPublicUrl;
}

export async function getWebexMcpUrl(): Promise<string | null> {
  const config = await loadResolvedAppConfig();
  return config.webexMcpUrl;
}

export async function getWebexSettingsView(): Promise<WebexSettingsView> {
  await migrateSecretsFromEnv();
  const [status, config, scopes, scopeMode, webexConfig] = await Promise.all([
    getSecretStatus(),
    loadResolvedAppConfig(),
    getWebexScopes(),
    getWebexScopeMode(),
    getWebexConfig(),
  ]);

  return {
    ...status,
    configured: Boolean(webexConfig),
    scopeMode,
    scopes,
    redirectUri: resolveWebexRedirectUri(config),
    mcpUrl: config.webexMcpUrl,
    appPublicUrl: config.appPublicUrl,
  };
}

export { WEBEX_SCOPE_PRESETS };
