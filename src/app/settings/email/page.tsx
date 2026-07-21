import { getAuthSession } from "@/lib/auth";
import { loadSettingsData } from "@/lib/settings/load";
import { EmailEmlImport } from "@/components/email-eml-import";
import { PartnerEmailRulesEditor } from "@/components/partner-email-rules-editor";
import { SettingsPanel } from "@/components/settings-panel";

export default async function EmailSettingsPage() {
  const session = await getAuthSession();
  if (!session) return null;

  const isAdmin = true;
  const { emailPolicy, emailPolicyActive, partnerName } = await loadSettingsData(session.userId);

  return (
    <>
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
          Signed in as <strong>{"ADMIN"}</strong>. Only admins can edit partner
          rules or run email imports.
        </p>
      ) : null}

      <SettingsPanel title="Partner email">
        <PartnerEmailRulesEditor
          isAdmin={isAdmin}
          policyActive={emailPolicyActive}
          initialPartnerName={partnerName}
        />
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
            fontSize: "0.75rem",
            marginBottom: "1rem",
            lineHeight: 1.5,
          }}
        >
          <strong>Auto-poll and Gong summaries:</strong> configure in{" "}
          <a href="/settings/preferences">Preferences → App configuration</a>.
          Apple Mail/Calendar import still requires deployment settings in <code>.env</code>.
        </p>

        {emailPolicy ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Email policy: {emailPolicy.status}
            {emailPolicy.description ? ` · ${emailPolicy.description}` : ""}
          </p>
        ) : null}

        <ol
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            marginBottom: "1rem",
            paddingLeft: "1.25rem",
            lineHeight: 1.6,
          }}
        >
          <li>
            <strong>Apple Mail (Mac):</strong> sync M365 in Mail.app, set{" "}
            <code>ENABLE_APPLE_MAIL_IMPORT=true</code>, grant{" "}
            <strong>Full Disk Access to Cursor.app</strong> (not only Terminal),
            restart Cursor, then import
          </li>
          <li>
            <strong>Apple Calendar (Mac):</strong> set{" "}
            <code>ENABLE_APPLE_CALENDAR_IMPORT=true</code>, grant Calendars access,
            then import
          </li>
          <li>
            <strong>Outlook desktop:</strong> export a <code>.pst</code> archive
          </li>
          <li>
            <strong>Zip shortcut:</strong> zip a folder of <code>.eml</code> /{" "}
            <code>.ics</code> files and upload
          </li>
          <li>
            <strong>PST on Mac:</strong> <code>brew install libpst</code>,{" "}
            <code>ENABLE_PST_IMPORT=true</code>
          </li>
          <li>Activate the email policy before importing</li>
        </ol>

        {isAdmin ? <EmailEmlImport disabled={false} policyActive={emailPolicyActive} /> : null}
      </SettingsPanel>
    </>
  );
}
