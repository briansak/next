import { getAuthSession } from "@/lib/auth";
import { getWebexScopeMode, getWebexScopes } from "@/lib/integrations/webex";
import { loadSettingsData } from "@/lib/settings/load";
import { WebexSyncActions } from "@/components/webex-sync-actions";
import { WebexSpacePicker } from "@/components/webex-space-picker";
import { WebexTechnologySpacePicker } from "@/components/webex-technology-space-picker";
import { WebexDealSpacePicker } from "@/components/webex-deal-space-picker";
import { IngestionAlerts, OAuthConnectLink } from "@/components/ingestion-connect";
import { SettingsPanel } from "@/components/settings-panel";

export default async function WebexSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const session = await getAuthSession();
  if (!session) return null;

  const isAdmin = true;
  const {
    webexConnected,
    webexConfig,
    webexPolicy,
    webexPolicyActive,
    hasWebexSpaces,
  } = await loadSettingsData(session.userId);

  return (
    <>
      <IngestionAlerts error={params.error} connected={params.connected} detail={params.detail} />

      {!isAdmin ? (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            padding: "0.75rem 1rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          Signed in as <strong>{"ADMIN"}</strong>. Only admins can connect
          Webex or run sync. The first registered user is admin; ask them to
          promote your account if needed.
        </p>
      ) : null}

      <SettingsPanel title="Webex connection">
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Status: {webexConnected ? "Connected" : "Not connected"}
          {webexPolicy ? (
            <>
              {" "}
              · Policy: {webexPolicy.status} · Priority spaces:{" "}
              {webexPolicy.webexAllowlists.filter((space) => space.purpose === "PRIORITIES").length}
              {" "}
              · Technology spaces:{" "}
              {webexPolicy.webexAllowlists.filter((space) => space.purpose === "TECHNOLOGY").length}
              {" "}
              · Deal spaces:{" "}
              {webexPolicy.webexAllowlists.filter((space) => space.purpose === "DEAL").length}
            </>
          ) : null}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Scope mode: <code>{getWebexScopeMode()}</code> · Requested:{" "}
          <code>{getWebexScopes()}</code>
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            marginBottom: "1rem",
            lineHeight: 1.5,
          }}
        >
          Enable the same scopes on your integration at developer.webex.com. For
          meetings (summaries, recordings, transcripts) use{" "}
          <code>WEBEX_SCOPE_MODE=standard+meetings+vidcast</code>, then reconnect
          Webex.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Uses Webex REST API. See <code>docs/WEBEX_INGESTION.md</code>.
        </p>

        {isAdmin && webexConfig && !webexConnected ? (
          <div style={{ marginBottom: "1rem" }}>
            <OAuthConnectLink href="/api/integrations/webex/connect" label="Connect Webex" />
          </div>
        ) : null}

        {isAdmin && webexConfig && webexConnected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <OAuthConnectLink
              href="/api/integrations/webex/connect"
              label="Reconnect Webex"
              secondary
            />
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
              Re-authorize after adding scopes or to switch Webex accounts
            </span>
          </div>
        ) : null}

        {!webexConfig ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Set WEBEX_CLIENT_ID and WEBEX_CLIENT_SECRET to enable.
          </p>
        ) : null}
      </SettingsPanel>

      {isAdmin && webexConnected ? (
        <>
          <SettingsPanel title="Space mapping">
            <WebexSpacePicker policyStatus={webexPolicy?.status ?? "DRAFT"} />
            <WebexTechnologySpacePicker policyStatus={webexPolicy?.status ?? "DRAFT"} />
            <WebexDealSpacePicker policyStatus={webexPolicy?.status ?? "DRAFT"} />
          </SettingsPanel>

          <SettingsPanel title="Sync">
            <WebexSyncActions disabled={false} />
            {!webexPolicyActive || !hasWebexSpaces ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
                Space message sync requires an active policy with allowlisted spaces.
                Meeting sync runs whenever Webex is connected.
              </p>
            ) : null}
          </SettingsPanel>
        </>
      ) : null}
    </>
  );
}
