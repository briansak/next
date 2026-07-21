import { getAuthSession } from "@/lib/auth";
import { getWebexScopeMode, getWebexScopes } from "@/lib/integrations/webex/config-store";
import { loadSettingsData } from "@/lib/settings/load";
import { WebexConfigEditor } from "@/components/webex-config-editor";
import { WebexSyncActions } from "@/components/webex-sync-actions";
import { WebexSpacePicker } from "@/components/webex-space-picker";
import { WebexTechnologySpacePicker } from "@/components/webex-technology-space-picker";
import { WebexDealSpacePicker } from "@/components/webex-deal-space-picker";
import { IngestionAlerts } from "@/components/ingestion-connect";
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

  const scopeMode = await getWebexScopeMode();
  const scopes = await getWebexScopes();

  return (
    <>
      <IngestionAlerts error={params.error} connected={params.connected} detail={params.detail} />

      <SettingsPanel title="Webex OAuth integration">
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Paste your Webex integration credentials below, save, then connect. Client ID and secret
          are encrypted locally — they are never returned to the browser after saving.
        </p>
        <WebexConfigEditor webexConnected={Boolean(webexConnected)} />
      </SettingsPanel>

      {webexConfig ? (
        <SettingsPanel title="Connection status">
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
            Scope mode: <code>{scopeMode}</code> · Requested: <code>{scopes}</code>
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            After changing scopes, reconnect Webex so the new permissions take effect.
          </p>
        </SettingsPanel>
      ) : null}

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
