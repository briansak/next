import Link from "next/link";

export default function AppleMailCalendarGettingStartedPage() {
  return (
    <main className="doc-page">
      <Link href="/settings/email" className="doc-back">
        ← Back to Email settings
      </Link>
      <h1>Apple Mail &amp; Calendar getting started</h1>
      <p>
        Next reads email and calendar data locally on your Mac — from Mail.app’s cache and
        Calendar.app via EventKit. There is no cloud connector. This guide explains why import
        buttons may be grayed out on first run and how to enable both services.
      </p>

      <h2>Why buttons are grayed out on first run</h2>
      <p>Apple Mail and Calendar import need two things:</p>
      <table>
        <thead>
          <tr>
            <th>Requirement</th>
            <th>First-run state</th>
            <th>Fix</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email policy active</td>
            <td>Policy starts as DRAFT</td>
            <td>Settings → Email → Activate email policy</td>
          </tr>
          <tr>
            <td>Apple import enabled</td>
            <td>Toggles off by default</td>
            <td>Settings → Email → Apple Mail &amp; Calendar</td>
          </tr>
        </tbody>
      </table>

      <h2>Step 1 — Activate the email policy</h2>
      <ol>
        <li>Open Settings → Email.</li>
        <li>Click Activate email policy.</li>
        <li>Status should change from DRAFT to ACTIVE.</li>
      </ol>

      <h2>Step 2 — Apple Mail</h2>
      <ol>
        <li>Sync your account in Mail.app and let it download mail.</li>
        <li>
          In Settings → Email → Apple Mail &amp; Calendar, enable <strong>Apple Mail import</strong>{" "}
          and save.
        </li>
        <li>
          Grant <strong>Full Disk Access</strong> to the app running <code>npm run next</code> (e.g.
          Terminal.app, iTerm, or Cursor), then quit and reopen that app.
        </li>
        <li>Click Import from Apple Mail on Settings → Email.</li>
      </ol>

      <h2>Step 3 — Apple Calendar</h2>
      <ol>
        <li>Ensure calendars sync in Calendar.app.</li>
        <li>
          In Settings → Email → Apple Mail &amp; Calendar, enable <strong>Apple Calendar import</strong>,
          set calendar names to match Calendar.app’s sidebar, and save.
        </li>
        <li>
          Allow Calendars access when prompted (or enable in System Settings → Privacy →
          Calendars).
        </li>
        <li>Click Import from Apple Calendar.</li>
      </ol>

      <h2>Optional — auto-poll</h2>
      <p>
        Enable auto-poll in Settings → Preferences to re-scan Mail and Calendar on a schedule.
        Apple import toggles in Settings → Email must remain enabled.
      </p>

      <h2>Troubleshooting</h2>
      <ul>
        <li>Grayed out → activate policy and enable Apple import toggles in Settings → Email.</li>
        <li>Mail returns 0 messages → sync Mail.app; grant Full Disk Access to the app running npm.</li>
        <li>Calendar access denied → allow Calendars for that same app in System Settings.</li>
        <li>No calendar events → set calendar names in Settings to match Calendar.app sidebar.</li>
      </ul>

      <p>
        Full guide in the repo:{" "}
        <a
          href="https://github.com/briansak/next/blob/main/docs/APPLE_MAIL_CALENDAR_GETTING_STARTED.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          APPLE_MAIL_CALENDAR_GETTING_STARTED.md
        </a>
      </p>
    </main>
  );
}
