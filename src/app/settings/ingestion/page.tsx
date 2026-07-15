import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scopedToTenant } from "@/lib/tenant";
import { getWebexConfig, getWebexScopeMode, getWebexScopes } from "@/lib/integrations/webex";
import { EmailEmlImport } from "@/components/email-eml-import";
import { WebexSyncActions } from "@/components/webex-sync-actions";
import { WebexSpacePicker } from "@/components/webex-space-picker";
import { WebexTechnologySpacePicker } from "@/components/webex-technology-space-picker";
import { IngestionAlerts, OAuthConnectLink } from "@/components/ingestion-connect";

export default async function IngestionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.role === "ADMIN";
  const tenantWhere = scopedToTenant(session.tenantId);

  const policies = await prisma.ingestionPolicy
    .findMany({
      where: tenantWhere,
      include: {
        webexAllowlists: true,
        emailAllowlists: true,
      },
      orderBy: { source: "asc" },
    })
    .catch(() => []);

  const webexConnected = await prisma.integrationToken
    .findUnique({
      where: {
        tenantId_provider: {
          tenantId: session.tenantId,
          provider: "WEBEX",
        },
      },
    })
    .catch(() => null);

  const webexConfig = getWebexConfig();
  const webexPolicy = policies.find((p) => p.source === "WEBEX");
  const emailPolicy = policies.find((p) => p.source === "EMAIL");
  const webexPolicyActive = webexPolicy?.status === "ACTIVE";
  const emailPolicyActive = emailPolicy?.status === "ACTIVE";
  const hasWebexSpaces = (webexPolicy?.webexAllowlists.length ?? 0) > 0;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Ingestion settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {session.partnerName ?? session.tenantName} — only explicitly allowlisted sources
          are synced. Personal inboxes are never ingested.
        </p>
      </header>

      <IngestionAlerts error={params.error} connected={params.connected} detail={params.detail} />

      {!isAdmin && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          Signed in as <strong>{session.role}</strong>. Only admins can connect
          Webex or run imports. Sign in as <code>admin@example.com</code> or ask
          an admin to promote your account.
        </p>
      )}

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Email &amp; calendar import
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem", lineHeight: 1.5 }}>
          Import partner email and calendar via Apple Mail/Calendar, file upload, or archive.
          Supports <code>.zip</code>, <code>.pst</code>, <code>.mbox</code>, <code>.ics</code>,
          and <code>.eml</code>. Allowlist rules still apply. New items are scored for @mentions,
          explicit asks, and deadlines automatically.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "1rem", lineHeight: 1.5 }}>
          <strong>Auto-poll:</strong> set <code>ENABLE_INGESTION_POLL=true</code> to re-scan Webex,
          Apple Mail, and Apple Calendar every 5 minutes while the dev server runs. Mentioned messages
          and response requests roll up on My Priorities with priority boosts.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "1rem", lineHeight: 1.5 }}>
          <strong>Gong summaries:</strong> when Gong sends meeting recap emails, they are matched to
          Webex meetings by title (last 21 days) and merged into meeting summaries and action items —
          without creating separate email records. Set <code>ENABLE_GONG_EMAIL_CORRELATION=false</code> to disable.
        </p>
        {emailPolicy && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Email policy: {emailPolicy.status} · Rules: {emailPolicy.emailAllowlists.length}
          </p>
        )}
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
            <strong>Apple Mail (Mac):</strong> add your Microsoft 365 account in Mail.app, let it sync,
            set <code>ENABLE_APPLE_MAIL_IMPORT=true</code> in <code>.env</code>, then click{" "}
            <strong>Import from Apple Mail</strong>
          </li>
          <li>
            <strong>Apple Calendar (Mac):</strong> if Outlook calendar syncs into Calendar.app, set{" "}
            <code>ENABLE_APPLE_CALENDAR_IMPORT=true</code> (optionally{" "}
            <code>APPLE_CALENDAR_NAMES=Calendar</code>), grant Calendars privacy access, then click{" "}
            <strong>Import from Apple Calendar</strong>
          </li>
          <li>
            <strong>Outlook desktop → Export:</strong> File → Open &amp; Export → Export to Outlook
            Data File (<code>.pst</code>)
          </li>
          <li>
            <strong>Zip shortcut:</strong> folder of <code>.eml</code> / <code>.ics</code> files → zip → upload
          </li>
          <li>
            <strong>PST on Mac:</strong> <code>brew install libpst</code>,{" "}
            <code>ENABLE_PST_IMPORT=true</code>
          </li>
          <li>Activate the email policy before importing</li>
        </ol>
        {isAdmin && (
          <EmailEmlImport disabled={false} policyActive={emailPolicyActive} />
        )}
      </section>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Webex
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Status: {webexConnected ? "Connected" : "Not connected"}
          {webexPolicy && (
            <>
              {" "}
              · Policy: {webexPolicy.status} · Priority spaces:{" "}
              {webexPolicy.webexAllowlists.filter((s) => s.purpose === "PRIORITIES").length}
              {" "}
              · Technology spaces:{" "}
              {webexPolicy.webexAllowlists.filter((s) => s.purpose === "TECHNOLOGY").length}
            </>
          )}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Scope mode: <code>{getWebexScopeMode()}</code> · Requested: <code>{getWebexScopes()}</code>
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "1rem", lineHeight: 1.5 }}>
          Enable the <strong>same scopes</strong> on your integration at developer.webex.com.
          For meetings (summaries, recordings, transcripts) use{" "}
          <code>WEBEX_SCOPE_MODE=standard+meetings</code> and reconnect Webex.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Uses Webex REST API (same backend as Messaging MCP tools). See{" "}
          <code>docs/WEBEX_INGESTION.md</code>.
        </p>
        {isAdmin && webexConfig && !webexConnected && (
          <div style={{ marginBottom: "1rem" }}>
            <OAuthConnectLink
              href="/api/integrations/webex/connect"
              label="Connect Webex"
            />
          </div>
        )}
        {isAdmin && webexConfig && webexConnected && (
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
        )}
        {isAdmin && webexConnected && (
          <>
            <WebexSpacePicker policyStatus={webexPolicy?.status ?? "DRAFT"} />
            <WebexTechnologySpacePicker policyStatus={webexPolicy?.status ?? "DRAFT"} />
            <div style={{ marginTop: "1.25rem" }}>
              <WebexSyncActions disabled={false} />
            </div>
            {!webexPolicyActive || !hasWebexSpaces ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                Space message sync requires an active policy with allowlisted spaces. Meeting sync
                runs whenever Webex is connected.
              </p>
            ) : null}
          </>
        )}
        {!webexConfig && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Set WEBEX_CLIENT_ID and WEBEX_CLIENT_SECRET to enable.
          </p>
        )}
      </section>

      {policies
        .filter((policy) => policy.source !== "WEBEX")
        .map((policy) => (
        <section
          key={policy.id}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>{policy.name}</h2>
            <StatusBadge status={policy.status} />
          </div>
          {policy.description && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              {policy.description}
            </p>
          )}

          {policy.source === "EMAIL" && (
            <div>
              <p style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                Email rules: {policy.emailAllowlists.length}
              </p>
              <ul style={{ listStyle: "none", fontSize: "0.875rem" }}>
                {policy.emailAllowlists.map((r) => (
                  <li key={r.id} style={{ color: "var(--text-muted)" }}>
                    {r.fromDomain && `Domain: ${r.fromDomain}`}
                    {r.fromAddress && `Address: ${r.fromAddress}`}
                    {r.subjectPrefix && `Subject: ${r.subjectPrefix}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "var(--text-muted)",
    ACTIVE: "var(--low)",
    PAUSED: "var(--high)",
  };

  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        color: colors[status] ?? "var(--text-muted)",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}
