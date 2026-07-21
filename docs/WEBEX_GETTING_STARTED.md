# Webex getting started

Connect Next to Webex with a **long-lived OAuth integration** — not a short personal access token. This guide walks through creating the integration, saving credentials in **Settings → Webex**, and keeping connectivity alive after the first access token expires.

## Why access tokens expire

Webex OAuth returns two tokens:

| Token | Typical lifetime | Purpose |
|-------|------------------|---------|
| **Access token** | ~12–14 hours (varies by integration) | Used on every Webex API call |
| **Refresh token** | Up to ~90 days (rotates on refresh) | Used to obtain new access tokens without signing in again |

Next stores both in your local database. When an API call runs and the access token is expired, Next automatically refreshes it using the refresh token.

If you only see ~12 hours of connectivity, common causes are:

- Using a **personal access token** instead of an OAuth integration
- Missing **refresh token** in the OAuth response (wrong grant or integration type)
- No background activity, so refresh never runs until a manual sync fails
- Refresh token revoked (password change, admin policy, or scope change)

## Step 1 — Create a Webex integration

1. Sign in to [developer.webex.com](https://developer.webex.com/) with the account that should authorize spaces.
2. Go to **My Webex Apps** → **Create a New App** → **Create an Integration**.
3. Set:
   - **Integration name:** `Next (local)` (any label you like)
   - **Redirect URI(s):** must exactly match your local callback:
     ```
     http://localhost:3000/api/integrations/webex/callback
     ```
     If you use a tunnel (ngrok) for webhooks, add that host’s callback URL too.
4. Select scopes. For a typical install, enable at least:
   - `spark:messages_read`
   - `spark:rooms_read`
   - `spark:people_read` (meetings)
   - Meeting scopes if you use Internal Calls — or pick the **standard+meetings+vidcast** preset in Settings
   - `spark:webhooks_read` / `spark:webhooks_write` (optional, for webhooks)
5. Save the app and copy the **Client ID** and **Client Secret**.

## Step 2 — Save credentials in Next

1. Run the app: `npm run next`
2. Open **Settings → Webex**
3. Paste **Client ID** and **Client secret** (password fields — encrypted locally, never shown again after save)
4. Confirm **App public URL** is `http://localhost:3000` and **Redirect URI** matches developer.webex.com
5. Choose a **Scope preset** (default: `standard+meetings+vidcast`) or enter custom scopes
6. Click **Save Webex settings**

No `.env` editing or server restart required.

## Step 3 — Connect Webex

1. On the same **Settings → Webex** page, click **Connect Webex**
2. Approve the integration in the browser
3. Next stores `accessToken`, `refreshToken`, and `expiresAt` in your local Postgres

You can also connect during the first-launch setup questionnaire (Step 4 — Webex).

## Step 4 — Keep connectivity alive

Next refreshes tokens **lazily** when a Webex API call runs after expiry. To avoid surprises:

1. **Enable auto-poll** in setup or **Settings → Preferences** (`Auto-poll integrations`). Background sync keeps tokens fresh on a schedule.
2. **Reconnect after scope changes** — if you add scopes in developer.webex.com, update the scope preset in Settings and click **Reconnect Webex**.
3. **Do not delete** the integration in developer.webex.com without reconnecting in Next.

### Verify refresh is working

After connecting, wait until after the access token expiry (or run a sync from Settings → Webex). Sync should succeed without opening the OAuth screen again.

If sync fails with “token refresh failed”, click **Reconnect Webex**.

## Step 5 — Allowlist spaces and activate

OAuth alone does not ingest messages. In **Settings → Webex**:

1. Add **Priority**, **Technology**, and/or **Deal** spaces.
2. Set the Webex policy to **Active** once at least one space is allowlisted.

See [WEBEX_INGESTION.md](./WEBEX_INGESTION.md) for architecture, webhooks, and scope details.

## Webhooks (optional, for real-time ingest)

For push ingestion when new messages arrive:

1. Expose your app with a public HTTPS URL — set **App public URL** in Settings → Webex (e.g. ngrok URL).
2. Generate a secret (`openssl rand -hex 32`) and save it in **Settings → Webex** → **Webhook secret**.
3. Use **Register webhooks** in Settings → Webex.

Webhooks still use the same OAuth tokens for verification and follow-up API calls.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connect button missing | Save Client ID and secret in **Settings → Webex** first |
| `redirect_uri_mismatch` | Redirect URI in developer.webex.com must match Settings → Webex exactly |
| `invalid_scope` | Enable matching scopes on the integration; set scope preset in Settings → Webex |
| Works ~12 hours then stops | Confirm refresh token exists in DB; enable auto-poll; reconnect |
| Scope upgrade needed | Update scope preset in Settings, then **Reconnect Webex** |

## Security notes

- Client ID and secret are **encrypted at rest** (`.local/encryption.key` on your machine).
- OAuth tokens live in your local Postgres; treat backups like credentials.
- This integration uses **your** Webex user delegation — appropriate for a single-user laptop install.
