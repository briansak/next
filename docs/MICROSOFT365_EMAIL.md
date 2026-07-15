# Microsoft 365 Email Ingestion

Connect a **shared/partner mailbox** via Microsoft Graph (delegated OAuth). Personal inboxes are never ingested.

## Cisco + Duo 2FA

Cisco tenants authenticate to Microsoft 365 with org MFA — often **Duo**. This app uses the standard OAuth authorization code flow:

1. Admin clicks **Connect Microsoft 365**
2. Browser redirects to `login.microsoftonline.com`
3. User signs in → **Duo prompt appears on Microsoft's page** (not in this app)
4. After success, tokens are stored for background sync via refresh token

**No Duo SDK is required.** If connect fails, check Conditional Access (device compliance, location) and admin consent.

## Azure App Registration

> **Enterprise note:** At Cisco (and many large tenants), individual contributors often cannot open **Microsoft Entra ID** in the Azure Portal — you may see `401 Error loading your content`. That is expected. You do **not** need Entra access to *use* the app once IT registers it; you only need someone with the right directory role to create the app registration and grant consent. See [No Entra ID access](#no-entra-id-access-cisco--enterprise) below.

1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: e.g. `Next Partner Ingestion (dev)`
3. Supported account types: **Single tenant** (Cisco tenant only)
4. Redirect URI (Web):
   - Dev: `http://localhost:3000/api/integrations/microsoft365/callback`
   - Prod: `https://<your-host>/api/integrations/microsoft365/callback`

### API Permissions (Delegated — Microsoft Graph)

| Permission | Why |
|------------|-----|
| `Mail.Read` | Read mail the signed-in user can access |
| `Mail.Read.Shared` | Read shared/delegated mailboxes |
| `User.Read` | Identify who completed OAuth (`/me`) |
| `offline_access` | Refresh tokens for sync without re-prompting Duo every hour |

Click **Grant admin consent** for the Cisco tenant (required for mail scopes in most orgs).

### Client Secret

Certificates & secrets → New client secret → copy value to `MICROSOFT_CLIENT_SECRET`.

### Env vars

```env
MICROSOFT_CLIENT_ID="<application (client) id>"
MICROSOFT_CLIENT_SECRET="<secret value>"
MICROSOFT_TENANT_ID="<Cisco tenant id>"
MICROSOFT_REDIRECT_URI="http://localhost:3000/api/integrations/microsoft365/callback"
MICROSOFT_SHARED_MAILBOX="wwt-coverage@yourcompany.com"
# Optional: pre-fill sign-in for service account reconnects
MICROSOFT_LOGIN_HINT="service-account@yourcompany.com"
```

`MICROSOFT_TENANT_ID` is the Entra directory ID (not the domain name).

## Shared Mailbox Prerequisites

- `MICROSOFT_SHARED_MAILBOX` must be the mailbox **UPN** (email address)
- The user who completes OAuth must have **Full Access** (or equivalent) to that mailbox in Exchange
- Delegated Graph access does **not** bypass Exchange permissions

## In-App Setup Checklist

1. Set all `MICROSOFT_*` env vars and restart the dev server
2. Sign in as tenant admin (`admin@example.com` in seed)
3. **Settings → Ingestion → Connect Microsoft 365** (complete Duo when prompted)
4. **Test mailbox access** — verifies Graph can read the shared mailbox
5. **Activate email policy** — enables allowlist rules (seed: `@wwt.com`, `[WWT]` subject)
6. **Sync email now** — ingests matching messages from the last 14 days
7. Check **Dashboard → Actionable communications** for `EMAIL` items

## Allowlist Rules

Email is ingested only when it matches **at least one** active policy rule:

- `fromDomain` — sender domain (e.g. `wwt.com`)
- `fromAddress` — exact sender address
- `subjectPrefix` — subject starts with (e.g. `[WWT]`)

Policy starts as **DRAFT** in seed data; activate it after a successful mailbox test.

## Common Hurdles

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Connect button missing | Env vars empty | Fill `MICROSOFT_CLIENT_ID`, `SECRET`, `TENANT_ID`, `REDIRECT_URI` |
| `AADSTS65001` / consent errors | Admin consent not granted | Azure → API permissions → Grant admin consent |
| Duo loop or blocked login | Conditional Access | Use compliant device/VPN; contact Cisco IT |
| Graph **403** on test/sync | No shared mailbox access | Grant Full Access to connecting account |
| Graph **404** on mailbox | Wrong `MICROSOFT_SHARED_MAILBOX` UPN | Verify address in Exchange admin |
| Sync returns 0 messages | Policy DRAFT or no allowlist match | Activate policy; confirm sender matches rules |
| Token refresh fails later | CA revoked refresh token | **Reconnect Microsoft 365** (Duo again) |

| Token refresh fails later | CA revoked refresh token | **Reconnect Microsoft 365** (Duo again) |
| Entra ID shows **401** in portal | No directory role | Request app registration via IT (see below) |

## No Entra ID access (Cisco / enterprise)

If **Microsoft Entra ID** fails to load with `401 Error loading your content`, your account lacks one of these (or equivalent) directory roles:

- Application Administrator
- Cloud Application Administrator
- Global Administrator

**You can still proceed** — someone with those permissions (Cisco IT, identity team, or a platform admin) registers the app and sends you four values.

### What to request from IT

Copy/paste this ticket body:

---

**Subject:** Azure app registration for partner mailbox ingestion (Microsoft Graph, delegated)

We need a **single-tenant** app registration for a partner-coverage tool that reads a **shared mailbox** via Microsoft Graph (delegated OAuth). Personal mailboxes are not accessed.

**App registration**
- Name: `Next Partner Ingestion (dev)` (or team naming standard)
- Supported accounts: **Single tenant** (Cisco only)
- Redirect URI (Web): `http://localhost:3000/api/integrations/microsoft365/callback`
  - Add production URI later if needed: `https://<host>/api/integrations/microsoft365/callback`

**Microsoft Graph delegated permissions**
- `Mail.Read`
- `Mail.Read.Shared`
- `User.Read`
- `offline_access`

**Admin consent:** Grant for the Cisco tenant.

**Client secret:** One secret for dev; share **Application (client) ID**, **Directory (tenant) ID**, and secret value through the approved secrets channel.

**Exchange (separate from Azure)**
- Confirm which **shared mailbox UPN** we should use (e.g. partner coverage alias).
- Grant my account (`<your-email>`) **Full Access** to that shared mailbox so delegated Graph calls succeed after I sign in with Duo.

---

### Values IT should return

| Value | Env var |
|-------|---------|
| Application (client) ID | `MICROSOFT_CLIENT_ID` |
| Client secret | `MICROSOFT_CLIENT_SECRET` |
| Directory (tenant) ID | `MICROSOFT_TENANT_ID` |
| Shared mailbox UPN | `MICROSOFT_SHARED_MAILBOX` |

### Workarounds that do **not** require Entra portal access

| Approach | Notes |
|----------|--------|
| **IT creates the app** | Normal path at Cisco |
| **Existing enterprise app** | If your org already has a Graph app for mail read, IT may add redirect URI + consent instead of a new registration |
| **Power Platform / M365 admin center** | Some teams register apps elsewhere; still need client ID + secret |
| **Continue with Webex only** | Email blocked on Azure access; Webex path is unaffected |

### Finding tenant ID without Entra ID

IT can provide the **Directory (tenant) ID**. Alternatively, after any successful Microsoft login to your org, the tenant ID sometimes appears in OAuth error URLs or IT documentation — do not guess; use the official ID from identity team.

## Import from Outlook without Azure

If you can use **Outlook on the web** (`outlook.office.com`) but cannot create an Azure app registration, export and upload archives:

### Supported formats

| Format | Contents | How to create |
|--------|----------|---------------|
| `.zip` | Multiple `.eml` + `.ics` files | Zip a folder of exported messages/calendar files |
| `.pst` | Mail + calendar (Outlook export) | Outlook desktop → Export to Outlook Data File |
| `.ics` | Calendar only | Outlook → Save Calendar |
| `.eml` | Single messages | Drag from Outlook desktop, or forward-as-attachment |
| `.mbox` | Mail (Unix mbox) | Upload a raw mbox file, or use **Import from Apple Mail** |

### In the app

1. **Settings → Ingestion → Import from Outlook (no Azure)**
2. **Activate email policy** (if DRAFT)
3. Upload **one** `.zip`, `.pst`, `.mbox`, or `.ics` archive (or multiple `.eml` files), or click **Import from Apple Mail**
4. Results show email + calendar import counts on the dashboard

Allowlist rules apply to both email (sender/subject) and calendar (organizer/subject, e.g. `[WWT]`).

### PST import (optional)

```bash
brew install libpst
```

```env
ENABLE_PST_IMPORT="true"
READPST_BIN="readpst"
UNZIP_BIN="unzip"
```

Without `readpst`, export mail from PST using Outlook to a folder, zip the `.eml` files, and upload the `.zip` instead.

### Apple Mail on Mac (no Azure, no export)

If you added your Microsoft 365 mailbox to **Mail.app**, messages are cached locally as `.emlx` / mbox under `~/Library/Mail/V10/...`.

1. Open **Mail.app** and confirm your inbox has synced
2. In `.env`:
   ```env
   ENABLE_APPLE_MAIL_IMPORT=true
   ```
3. Restart the dev server
4. **Settings → Ingestion → Import from Apple Mail**

The scanner reads `.emlx` and `mbox` files from the last 14 days (configurable via `APPLE_MAIL_LOOKBACK_DAYS`), applies the same allowlist, and ingests matching messages.

**macOS privacy:** if import finds 0 messages, grant **Full Disk Access** to your terminal app (or iTerm) in **System Settings → Privacy & Security → Full Disk Access**, then restart the terminal and dev server.

Imported email appears as `EMAIL` with tag `apple-mail-import`. Archive uploads still appear as `EMAIL` / `OUTLOOK_CALENDAR`. This is manual — use Graph API when IT provides app credentials.

### Apple Calendar on Mac (Outlook sync → Calendar.app)

If Outlook calendar syncs into **Calendar.app** (common on Mac), you can import events without Azure:

1. Confirm events appear in Calendar.app (often under a calendar named **Calendar** or **Work**)
2. In `.env`:
   ```env
   ENABLE_APPLE_CALENDAR_IMPORT=true
   # Optional — speeds up large Exchange calendars:
   APPLE_CALENDAR_NAMES=Calendar
   ```
3. Restart the dev server
4. **Settings → Ingestion → Import from Apple Calendar**

The export uses macOS **EventKit** (fast date-range queries) instead of slow Calendar AppleScript. Default window: past 14 days + next 30 days. Same allowlist rules apply (organizer domain, `[WWT]` subject prefix).

**macOS privacy:** grant **Calendars** access to your terminal or IDE in **System Settings → Privacy & Security → Calendars**. If import returns 0 candidates, set `APPLE_CALENDAR_NAMES` to the exact calendar name from Calendar.app’s sidebar.

Imported events appear as `OUTLOOK_CALENDAR` with tag `apple-calendar-import`.

## Architecture Notes

- **Delegated auth only** today — sync uses refresh tokens from whoever connected
- For unattended production sync, consider a dedicated service account + documented reconnect cadence, or future app-only permissions (architectural change)
- Tokens are stored in `IntegrationToken` (encrypt at rest before production)
- Multi-tenant: shared mailbox is currently **global per deployment** (`MICROSOFT_SHARED_MAILBOX`); per-tenant mailbox config is a future enhancement

## API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/integrations/microsoft365/connect` | Start OAuth |
| `GET /api/integrations/microsoft365/callback` | OAuth callback |
| `POST /api/integrations/microsoft365/sync` | `{ "action": "sync" }` or `{ "action": "test" }` |
| `POST /api/integrations/microsoft365/policy` | Activate EMAIL ingestion policy |
