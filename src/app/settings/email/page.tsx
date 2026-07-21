import { getAuthSession } from "@/lib/auth";
import { getAppConfig } from "@/lib/config/app-config-store";
import { loadSettingsData } from "@/lib/settings/load";
import { AppleImportSettingsEditor } from "@/components/apple-import-settings-editor";
import { EmailEmlImport } from "@/components/email-eml-import";
import { PartnerEmailRulesEditor } from "@/components/partner-email-rules-editor";
import { SettingsPanel } from "@/components/settings-panel";

export default async function EmailSettingsPage() {
  const session = await getAuthSession();
  if (!session) return null;

  const isAdmin = true;
  const [{ emailPolicy, emailPolicyActive, partnerName }, appConfig] =
    await Promise.all([
      loadSettingsData(session.userId),
      getAppConfig(session.userId),
    ]);

  return (
    <>
      <SettingsPanel title="Partner email">
        <PartnerEmailRulesEditor
          isAdmin={isAdmin}
          policyActive={emailPolicyActive}
          initialPartnerName={partnerName}
        />
      </SettingsPanel>

      <SettingsPanel title="Apple Mail & Calendar">
        <AppleImportSettingsEditor />
      </SettingsPanel>

      <SettingsPanel title="Email & calendar import">
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1rem",
            lineHeight: 1.5,
          }}
        >
          Import email and calendar via Apple Mail/Calendar, file upload, or archive.
          Supports <code>.zip</code>, <code>.pst</code>, <code>.mbox</code>,{" "}
          <code>.ics</code>, and <code>.eml</code>. Partner rules above boost priority on
          My Priorities; they do not block ingestion.
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1rem",
            lineHeight: 1.5,
          }}
        >
          <a
            href="/docs/apple-mail-calendar-getting-started"
            style={{ color: "var(--accent)", fontWeight: 500 }}
          >
            Apple Mail &amp; Calendar getting started guide
          </a>
          {" "}— macOS permissions and troubleshooting.
          {" "}
          <strong>Auto-poll</strong> is in{" "}
          <a href="/settings/preferences">Preferences → App configuration</a>.
        </p>

        {emailPolicy ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Email policy: {emailPolicy.status}
            {emailPolicy.description ? ` · ${emailPolicy.description}` : ""}
          </p>
        ) : null}

        {isAdmin ? (
          <EmailEmlImport
            disabled={false}
            policyActive={emailPolicyActive}
            appleMailEnabled={appConfig.enableAppleMailImport}
            appleCalendarEnabled={appConfig.enableAppleCalendarImport}
          />
        ) : null}
      </SettingsPanel>
    </>
  );
}
