"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OAuthConnectLink } from "@/components/ingestion-connect";

interface WebexSettings {
  configured: boolean;
  webexClientIdConfigured: boolean;
  webexClientIdHint: string | null;
  webexClientSecretConfigured: boolean;
  webexWebhookSecretConfigured: boolean;
  scopeMode: string;
  scopes: string;
  redirectUri: string;
  mcpUrl: string | null;
  appPublicUrl: string;
}

const fieldLabelStyle = {
  display: "block",
  fontWeight: 500,
  fontSize: "0.875rem",
  marginBottom: "0.35rem",
} as const;

const hintStyle = {
  display: "block",
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  lineHeight: 1.5,
  marginTop: "0.25rem",
} as const;

const inputStyle = {
  width: "100%",
  maxWidth: "32rem",
  padding: "0.5rem 0.65rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.875rem",
} as const;

const inlineButtonStyle = {
  padding: "0.5rem 0.85rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.875rem",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

interface WebexConfigEditorProps {
  webexConnected: boolean;
}

export function WebexConfigEditor({ webexConnected }: WebexConfigEditorProps) {
  const router = useRouter();
  const [settings, setSettings] = useState<WebexSettings | null>(null);
  const [scopePresets, setScopePresets] = useState<string[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [scopeMode, setScopeMode] = useState("standard+meetings+vidcast");
  const [customScopes, setCustomScopes] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [appPublicUrl, setAppPublicUrl] = useState("http://localhost:3000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings/webex");
    if (!res.ok) return;
    const data = await res.json();
    const nextSettings = data.settings as WebexSettings;
    setSettings(nextSettings);
    setScopePresets(Array.isArray(data.scopePresets) ? data.scopePresets : []);
    setScopeMode(nextSettings.scopeMode);
    setCustomScopes(nextSettings.scopeMode === "custom" ? nextSettings.scopes : "");
    setRedirectUri(nextSettings.redirectUri);
    setMcpUrl(nextSettings.mcpUrl ?? "");
    setAppPublicUrl(nextSettings.appPublicUrl);
    setClientId("");
    setClientSecret("");
    setWebhookSecret("");
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSavedMessage(null);

    try {
      const body: Record<string, string | null> = {
        scopeMode,
        customScopes: scopeMode === "custom" ? customScopes.trim() || null : null,
        redirectUri: redirectUri.trim() || null,
        mcpUrl: mcpUrl.trim() || null,
        appPublicUrl: appPublicUrl.trim() || null,
      };

      if (clientId.trim()) body.clientId = clientId.trim();
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const res = await fetch("/api/settings/webex", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Could not save Webex settings");
      }

      setSettings(data.settings ?? null);
      setClientId("");
      setClientSecret("");
      setWebhookSecret("");
      setSavedMessage("Webex settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Webex settings");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
        Loading Webex settings…
      </p>
    );
  }

  return (
    <form onSubmit={saveSettings}>
      <p style={{ ...hintStyle, marginTop: 0, marginBottom: "1rem" }}>
        Create an OAuth integration at{" "}
        <a href="https://developer.webex.com" target="_blank" rel="noopener noreferrer">
          developer.webex.com
        </a>{" "}
        and paste the credentials here. Client ID and secret are encrypted on your machine.
        See the{" "}
        <Link href="/docs/webex-getting-started" style={{ color: "var(--accent)" }}>
          getting started guide
        </Link>
        .
      </p>

      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label htmlFor="webex-client-id" style={fieldLabelStyle}>
            Client ID
          </label>
          <input
            id="webex-client-id"
            type="password"
            autoComplete="off"
            value={clientId}
            disabled={busy}
            onChange={(event) => setClientId(event.target.value)}
            placeholder={
              settings.webexClientIdConfigured
                ? `Saved (${settings.webexClientIdHint ?? "configured"}) — enter to replace`
                : "Paste client ID"
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="webex-client-secret" style={fieldLabelStyle}>
            Client secret
          </label>
          <input
            id="webex-client-secret"
            type="password"
            autoComplete="new-password"
            value={clientSecret}
            disabled={busy}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={
              settings.webexClientSecretConfigured
                ? "Saved — enter a new value to replace"
                : "Paste client secret"
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="webex-app-url" style={fieldLabelStyle}>
            App public URL
          </label>
          <input
            id="webex-app-url"
            type="url"
            value={appPublicUrl}
            disabled={busy}
            onChange={(event) => setAppPublicUrl(event.target.value)}
            placeholder="http://localhost:3000"
            style={inputStyle}
          />
          <span style={hintStyle}>
            Used for OAuth redirect defaults and webhook registration.
          </span>
        </div>

        <div>
          <label htmlFor="webex-redirect-uri" style={fieldLabelStyle}>
            OAuth redirect URI
          </label>
          <input
            id="webex-redirect-uri"
            type="url"
            value={redirectUri}
            disabled={busy}
            onChange={(event) => setRedirectUri(event.target.value)}
            placeholder={`${appPublicUrl}/api/integrations/webex/callback`}
            style={inputStyle}
          />
          <span style={hintStyle}>
            Must match the redirect URI on your Webex integration exactly.
          </span>
        </div>

        <div>
          <label htmlFor="webex-scope-mode" style={fieldLabelStyle}>
            Scope preset
          </label>
          <select
            id="webex-scope-mode"
            value={scopeMode}
            disabled={busy}
            onChange={(event) => setScopeMode(event.target.value)}
            style={inputStyle}
          >
            {scopePresets.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
            <option value="custom">custom</option>
          </select>
          {scopeMode === "custom" ? (
            <textarea
              value={customScopes}
              disabled={busy}
              onChange={(event) => setCustomScopes(event.target.value)}
              placeholder="space-separated scopes"
              rows={3}
              style={{ ...inputStyle, marginTop: "0.5rem", maxWidth: "32rem" }}
            />
          ) : (
            <span style={hintStyle}>
              Requested scopes: <code>{settings.scopes}</code>
            </span>
          )}
        </div>

        <div>
          <label htmlFor="webex-mcp-url" style={fieldLabelStyle}>
            Vidcast MCP URL (optional)
          </label>
          <input
            id="webex-mcp-url"
            type="url"
            value={mcpUrl}
            disabled={busy}
            onChange={(event) => setMcpUrl(event.target.value)}
            placeholder="https://mcp.webexapis.com/mcp/vidcast"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="webex-webhook-secret" style={fieldLabelStyle}>
            Webhook secret (optional)
          </label>
          <input
            id="webex-webhook-secret"
            type="password"
            autoComplete="new-password"
            value={webhookSecret}
            disabled={busy}
            onChange={(event) => setWebhookSecret(event.target.value)}
            placeholder={
              settings.webexWebhookSecretConfigured
                ? "Saved — enter a new value to replace"
                : "Generate with: openssl rand -hex 32"
            }
            style={inputStyle}
          />
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--critical)", fontSize: "0.8rem", marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}

      {savedMessage ? (
        <p style={{ color: "var(--success, #15803d)", fontSize: "0.8rem", marginTop: "1rem" }}>
          {savedMessage}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "1.25rem",
        }}
      >
        <button
          type="submit"
          disabled={busy}
          style={{
            ...inlineButtonStyle,
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "#fff",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Saving…" : "Save Webex settings"}
        </button>

        {settings.configured ? (
          webexConnected ? (
            <OAuthConnectLink
              href="/api/integrations/webex/connect"
              label="Reconnect Webex"
              secondary
            />
          ) : (
            <OAuthConnectLink href="/api/integrations/webex/connect" label="Connect Webex" />
          )
        ) : null}
      </div>
    </form>
  );
}
