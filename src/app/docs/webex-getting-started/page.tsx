import Link from "next/link";

export default function WebexGettingStartedPage() {
  return (
    <main className="doc-page">
      <Link href="/setup" className="doc-back">
        ← Back to setup
      </Link>
      <h1>Webex getting started</h1>
      <p>
        Connect Next to Webex with a long-lived OAuth integration — not a short personal access
        token. This guide covers creating the integration, saving credentials in Settings, and
        keeping connectivity alive after the first access token expires.
      </p>

      <h2>Why access tokens expire</h2>
      <p>Webex OAuth returns two tokens:</p>
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Typical lifetime</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Access token</td>
            <td>~12–14 hours</td>
            <td>Used on every Webex API call</td>
          </tr>
          <tr>
            <td>Refresh token</td>
            <td>Up to ~90 days</td>
            <td>Obtains new access tokens without signing in again</td>
          </tr>
        </tbody>
      </table>
      <p>
        Next stores both in your local database and refreshes automatically when an API call runs
        after expiry. Enable auto-poll in setup or Settings → Preferences so background sync keeps
        tokens fresh.
      </p>

      <h2>Step 1 — Create a Webex integration</h2>
      <ol>
        <li>
          Sign in at{" "}
          <a href="https://developer.webex.com/" target="_blank" rel="noopener noreferrer">
            developer.webex.com
          </a>
          .
        </li>
        <li>
          <strong>My Webex Apps</strong> → <strong>Create a New App</strong> →{" "}
          <strong>Create an Integration</strong>.
        </li>
        <li>
          Set redirect URI to exactly:
          <pre>
            <code>http://localhost:3000/api/integrations/webex/callback</code>
          </pre>
        </li>
        <li>
          Enable scopes such as <code>spark:messages_read</code>, <code>spark:rooms_read</code>,{" "}
          <code>spark:webhooks_read</code>, and <code>spark:webhooks_write</code>. Add meeting
          scopes if you use Internal Calls.
        </li>
        <li>Copy the Client ID and Client Secret.</li>
      </ol>

      <h2>Step 2 — Save credentials in Settings</h2>
      <p>
        Open <strong>Settings → Webex</strong> and enter Client ID, Client Secret, redirect URI, and
        scope preset (e.g. <code>standard+meetings</code>). Click save — no server restart required.
      </p>

      <h2>Step 3 — Connect in Next</h2>
      <p>
        Use <strong>Connect Webex</strong> on the setup questionnaire or in Settings → Webex.
        Approve the integration in your browser. Next stores access and refresh tokens locally.
      </p>

      <h2>Step 4 — Keep connectivity alive</h2>
      <ul>
        <li>Enable auto-poll in setup or Settings → Preferences.</li>
        <li>Reconnect after changing scopes in developer.webex.com.</li>
        <li>If sync fails with token refresh errors, click Reconnect Webex.</li>
      </ul>

      <h2>Step 5 — Allowlist spaces</h2>
      <p>
        OAuth does not ingest messages by itself. Add Priority, Technology, or Deal spaces in
        Settings → Webex and activate the policy.
      </p>

      <p>
        Full architecture and webhook setup:{" "}
        <a
          href="https://github.com/briansak/next/blob/main/docs/WEBEX_INGESTION.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          WEBEX_INGESTION.md
        </a>
      </p>
    </main>
  );
}
