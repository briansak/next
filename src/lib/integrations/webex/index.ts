/**
 * Webex Spaces integration.
 * Uses REST API directly. Messaging MCP tools (webex-search-messages, etc.)
 * wrap these same endpoints — see docs/WEBEX_INGESTION.md.
 */

const WEBEX_API = "https://webexapis.com/v1";

export interface WebexConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface WebexMessage {
  id: string;
  roomId: string;
  personEmail: string;
  personDisplayName: string;
  text: string;
  created: string;
  parentId?: string;
  hasFiles?: boolean;
}

export function normalizeWebexMessage(
  raw: Partial<WebexMessage> & { id: string; roomId: string; created: string }
): WebexMessage | null {
  if (!raw.id || !raw.roomId || !raw.created) return null;

  const text = (raw.text ?? "").trim();
  const body =
    text ||
    (raw.hasFiles ? "[Attachment — no text]" : "[Empty message]");

  return {
    id: raw.id,
    roomId: raw.roomId,
    personEmail: raw.personEmail ?? "",
    personDisplayName: raw.personDisplayName ?? "Unknown",
    text: body,
    created: raw.created,
    parentId: raw.parentId,
    hasFiles: raw.hasFiles,
  };
}

export interface WebexSpace {
  id: string;
  title: string;
  type: string;
  lastActivity?: string;
  created?: string;
}

export interface WebexSpaceAllowlistEntry {
  id?: string;
  spaceId: string;
  spaceTitle?: string;
  purpose?: "PRIORITIES" | "TECHNOLOGY";
  technologyLabel?: string;
}

export interface WebexWebhookPayload {
  id: string;
  name: string;
  resource: string;
  event: string;
  filter?: string;
  orgId: string;
  createdBy: string;
  appId: string;
  ownedBy: string;
  status: string;
  actorId?: string;
  data: {
    id: string;
    roomId: string;
    roomType?: string;
    personId?: string;
    personEmail?: string;
    created?: string;
    text?: string;
    parentId?: string;
  };
}

export function getWebexConfig(): WebexConfig | null {
  const clientId = process.env.WEBEX_CLIENT_ID;
  const clientSecret = process.env.WEBEX_CLIENT_SECRET;
  const redirectUri = process.env.WEBEX_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

// Scopes must be checked on your integration at developer.webex.com.
// Set WEBEX_SCOPES explicitly, or use WEBEX_SCOPE_MODE preset (see below).
export const WEBEX_SCOPE_PRESETS = {
  /** User-delegated: spaces the authenticating user is a member of */
  standard: ["spark:messages_read", "spark:rooms_read"],
  /** Messages + meetings (schedules, summaries, recordings, transcripts, participants) */
  "standard+meetings": [
    "spark:messages_read",
    "spark:rooms_read",
    "spark:people_read",
    "meeting:schedules_read",
    "meeting:summaries_read",
    "meeting:recordings_read",
    "meeting:transcripts_read",
    "meeting:participants_read",
  ],
  /** Org-wide compliance: requires compliance officer / admin role */
  compliance: ["spark-compliance:messages_read", "spark-compliance:rooms_read"],
  "standard+webhooks": [
    "spark:messages_read",
    "spark:rooms_read",
    "spark:webhooks_read",
    "spark:webhooks_write",
  ],
  "compliance+webhooks": [
    "spark-compliance:messages_read",
    "spark-compliance:rooms_read",
    "spark-compliance:webhooks_read",
    "spark-compliance:webhooks_write",
  ],
} as const;

export type WebexScopeMode = keyof typeof WEBEX_SCOPE_PRESETS;

export function getWebexScopes(): string {
  const explicit = process.env.WEBEX_SCOPES?.trim();
  if (explicit) return explicit;

  const mode = (process.env.WEBEX_SCOPE_MODE ?? "standard") as WebexScopeMode;
  const preset = WEBEX_SCOPE_PRESETS[mode];
  if (preset) return preset.join(" ");

  return WEBEX_SCOPE_PRESETS.standard.join(" ");
}

export function getWebexScopeMode(): string {
  if (process.env.WEBEX_SCOPES?.trim()) return "custom";
  return process.env.WEBEX_SCOPE_MODE ?? "standard";
}

export function getWebexOAuthUrl(config: WebexConfig, state: string): string {
  const url = new URL(`${WEBEX_API}/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", getWebexScopes());
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeWebexCode(
  config: WebexConfig,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${WEBEX_API}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      scope: getWebexScopes(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webex token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshWebexToken(
  config: WebexConfig,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${WEBEX_API}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Webex token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresIn: data.expires_in,
  };
}

export async function listSpaces(
  accessToken: string,
  options?: { query?: string; max?: number }
): Promise<WebexSpace[]> {
  const url = new URL(`${WEBEX_API}/rooms`);
  url.searchParams.set("sortBy", "lastactivity");
  url.searchParams.set("max", String(options?.max ?? 100));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Webex rooms API error: ${response.status}`);
  }

  const data = (await response.json()) as { items: WebexSpace[] };
  let items = data.items ?? [];

  if (options?.query) {
    const q = options.query.toLowerCase();
    items = items.filter((s) => s.title.toLowerCase().includes(q));
  }

  return items.sort((a, b) => {
    const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return bTime - aTime;
  });
}

/** @deprecated Use listSpaces */
export async function searchSpaces(
  accessToken: string,
  query?: string
): Promise<WebexSpace[]> {
  return listSpaces(accessToken, { query });
}

export async function fetchAllowlistedMessages(
  accessToken: string,
  allowlist: WebexSpaceAllowlistEntry[],
  since?: Date
): Promise<WebexMessage[]> {
  if (allowlist.length === 0) {
    return [];
  }

  const allowedSpaceIds = new Set(allowlist.map((a) => a.spaceId));
  const messages: WebexMessage[] = [];

  for (const entry of allowlist) {
    const url = new URL(`${WEBEX_API}/messages`);
    url.searchParams.set("roomId", entry.spaceId);
    url.searchParams.set("max", "100");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Webex API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      items: Array<Partial<WebexMessage> & { id: string; roomId: string; created: string }>;
    };

    for (const raw of data.items ?? []) {
      if (!allowedSpaceIds.has(raw.roomId)) continue;
      if (since && new Date(raw.created) <= since) continue;
      const msg = normalizeWebexMessage(raw);
      if (msg) messages.push(msg);
    }
  }

  return messages;
}

export async function createMessageWebhook(
  accessToken: string,
  targetUrl: string,
  roomId: string,
  name: string,
  secret?: string
): Promise<{ id: string }> {
  const body: Record<string, string> = {
    name,
    targetUrl,
    resource: "messages",
    event: "created",
    filter: `roomId=${roomId}`,
  };

  if (secret) {
    body.secret = secret;
  }

  const response = await fetch(`${WEBEX_API}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Webex webhook create failed: ${response.status} ${err}`);
  }

  return (await response.json()) as { id: string };
}

export async function deleteWebhook(
  accessToken: string,
  webhookId: string
): Promise<void> {
  const response = await fetch(`${WEBEX_API}/webhooks/${webhookId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Webex webhook delete failed: ${response.status}`);
  }
}
