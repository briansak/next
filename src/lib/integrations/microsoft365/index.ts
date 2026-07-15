/**
 * Microsoft 365 email via Graph API.
 * Connects to a shared/partner mailbox — never a personal inbox.
 */

import {
  matchesEmailAllowlist,
  type EmailAllowlistRule,
  type EmailMessage,
} from "@/lib/integrations/email/allowlist";

export type { EmailMessage, EmailAllowlistRule };
export { matchesEmailAllowlist };

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com";

const SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Read.Shared",
].join(" ");

export interface Microsoft365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: { content: string };
  receivedDateTime: string;
  conversationId: string;
  from?: {
    emailAddress?: { name?: string; address?: string };
  };
}

export function getMicrosoft365OAuthUrl(
  config: Microsoft365Config,
  state: string,
  options?: { loginHint?: string }
): string {
  const url = new URL(`${AUTH_BASE}/${config.tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("prompt", "select_account");
  if (options?.loginHint) {
    url.searchParams.set("login_hint", options.loginHint);
  }
  return url.toString();
}

export async function exchangeMicrosoft365Code(
  config: Microsoft365Config,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${AUTH_BASE}/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Microsoft token exchange failed: ${response.status} ${body}`);
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

export async function refreshMicrosoft365Token(
  config: Microsoft365Config,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`${AUTH_BASE}/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Microsoft token refresh failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch messages from a shared mailbox and filter through the email allowlist.
 * Only messages matching at least one rule are returned.
 */
export async function fetchAllowlistedEmails(
  accessToken: string,
  sharedMailbox: string,
  rules: EmailAllowlistRule[],
  since?: Date
): Promise<EmailMessage[]> {
  if (rules.length === 0) {
    return [];
  }

  const url = new URL(`${GRAPH_BASE}/users/${encodeURIComponent(sharedMailbox)}/messages`);
  url.searchParams.set("$top", "50");
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set(
    "$select",
    "id,subject,bodyPreview,body,receivedDateTime,conversationId,from"
  );

  if (since) {
    url.searchParams.set(
      "$filter",
      `receivedDateTime ge ${since.toISOString()}`
    );
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      formatGraphError(response.status, response.statusText, body, sharedMailbox)
    );
  }

  const data = (await response.json()) as { value: GraphMessage[] };
  const messages: EmailMessage[] = [];

  for (const msg of data.value ?? []) {
    const fromAddress = msg.from?.emailAddress?.address ?? "";
    const normalized: EmailMessage = {
      messageId: msg.id,
      subject: msg.subject ?? "",
      body: msg.body?.content ?? msg.bodyPreview ?? "",
      fromAddress,
      fromName: msg.from?.emailAddress?.name,
      receivedAt: new Date(msg.receivedDateTime),
      threadId: msg.conversationId,
    };

    if (matchesEmailAllowlist(normalized, rules)) {
      messages.push(normalized);
    }
  }

  return messages;
}

export async function getMicrosoft365User(
  accessToken: string
): Promise<{ displayName?: string; mail?: string; userPrincipalName?: string } | null> {
  const response = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
}

/** Quick mailbox access check — does not apply allowlist filtering. */
export async function probeMicrosoft365Mailbox(
  accessToken: string,
  sharedMailbox: string
): Promise<{
  ok: boolean;
  messageCount?: number;
  error?: string;
  hint?: string;
}> {
  const url = new URL(`${GRAPH_BASE}/users/${encodeURIComponent(sharedMailbox)}/messages`);
  url.searchParams.set("$top", "1");
  url.searchParams.set("$select", "id");
  url.searchParams.set("$orderby", "receivedDateTime desc");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: formatGraphError(response.status, response.statusText, body, sharedMailbox),
      hint: graphErrorHint(response.status),
    };
  }

  const data = (await response.json()) as { value?: unknown[] };
  return { ok: true, messageCount: data.value?.length ?? 0 };
}

function formatGraphError(
  status: number,
  statusText: string,
  body: string,
  mailbox: string
): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
    if (parsed.error?.message) {
      detail = ` — ${parsed.error.message}`;
    }
  } catch {
    if (body) detail = ` — ${body.slice(0, 200)}`;
  }
  return `Graph API ${status} ${statusText} for mailbox ${mailbox}${detail}`;
}

function graphErrorHint(status: number): string | undefined {
  if (status === 401) {
    return "Token expired or invalid. Reconnect Microsoft 365 (Duo may be required again).";
  }
  if (status === 403) {
    return "The connected account may lack Full Access to the shared mailbox, or admin consent for Mail.Read.Shared is missing.";
  }
  if (status === 404) {
    return "Shared mailbox UPN not found. Verify MICROSOFT_SHARED_MAILBOX matches the mailbox address in Exchange.";
  }
  return undefined;
}

export function getMicrosoft365Config(): Microsoft365Config | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !tenantId || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, tenantId, redirectUri };
}
