# Apple Mail & Calendar getting started

Next reads email and calendar data **locally on your Mac** — from Mail.app’s on-disk cache and Calendar.app via EventKit. There is no Microsoft Graph or cloud connector. This guide explains why import buttons may be grayed out on first run and how to enable both services.

## Why buttons are grayed out on first run

Apple Mail and Calendar import require **two things** before the buttons work:

| Requirement | First-run state | Fix |
|-------------|-----------------|-----|
| **Email policy active** | Policy starts as `DRAFT` after setup | Settings → Email → **Activate email policy** |
| **Apple import enabled** | Toggles default off | Settings → Email → **Apple Mail & Calendar** |

Until both are done, **Import from Apple Mail** and **Import from Apple Calendar** appear dimmed (same as file upload).

Partner email rules (domains, subject prefixes) are optional for import — they boost priority on My Priorities but do not block ingestion.

## Overview

```
Mail.app (synced account)          Calendar.app (synced account)
        │                                      │
        ▼                                      ▼
~/Library/Mail/…                   export-apple-calendar.swift
        │                                      │
        └──────────────► Next import ◄─────────┘
                              │
                              ▼
                    Communications (local DB)
```

| Source | What Next reads | macOS permission |
|--------|-----------------|------------------|
| **Apple Mail** | Cached messages under `~/Library/Mail` | **Full Disk Access** for the app running Next (Cursor, Terminal, etc.) |
| **Apple Calendar** | Events via Swift + EventKit | **Calendars** privacy permission for that same app |

Both only work on **macOS**. Linux/Windows installs can still use file import (`.eml`, `.zip`, `.pst`, `.ics`).

---

## Step 1 — Partner rules (optional but recommended)

1. Open **Settings → Email → Partner email**.
2. Set your partner organization name, email domain (e.g. `acme.com`), and subject prefix (e.g. `[ACME]`).
3. These rules help My Priorities surface partner messages; they are not required to run import.

If you configured these during first-launch setup, you can skip this step.

---

## Step 2 — Activate the email policy

1. Stay on **Settings → Email**.
2. Click **Activate email policy** (above the import buttons).
3. Status should change from `DRAFT` to `ACTIVE`.

File upload and Apple import buttons unlock once the policy is active and Apple import toggles are enabled in Settings (see below).

---

## Step 3 — Enable Apple Mail import

### 3a. Sync mail in Mail.app

1. Open **Mail.app**.
2. Add your work account (Exchange / Microsoft 365 / IMAP — whatever you use).
3. Let Mail fully sync the folders you care about. Next reads the **local cache**, not the server directly.

### 3b. Enable in Settings

1. Open **Settings → Email → Apple Mail & Calendar**.
2. Turn on **Import from Apple Mail**.
3. Click **Save Apple import settings**.

No server restart required.

Advanced: **Settings → Preferences → Advanced integrations** — Apple Mail path and lookback days.

### 3c. Grant Full Disk Access

Apple Mail data lives under `~/Library/Mail`. macOS blocks access unless you grant **Full Disk Access** to the process running Next:

1. **System Settings → Privacy & Security → Full Disk Access**
2. Enable the **app that runs Next** — e.g. **Terminal.app**, iTerm, or Cursor if you use its integrated terminal.
3. **Quit and reopen** that app after changing this setting (required for FDA to take effect).

Without Full Disk Access, import may return zero messages or errors about the Envelope Index.

### 3d. Run import

1. **Settings → Email → Import from Apple Mail**
2. First scan can take up to ~60 seconds.
3. Check the result line for scanned / imported counts.

**Tips:**

- Increase `APPLE_MAIL_LOOKBACK_DAYS` if recent mail is missing.
- Internal call replay emails are discovered through Apple Mail when enabled.
- Enable **auto-poll** in Settings → Preferences to re-scan periodically.

---

## Step 4 — Enable Apple Calendar import

### 4a. Sync calendars in Calendar.app

1. Open **Calendar.app**.
2. Ensure your work calendar is subscribed and syncing (often named **Calendar**, **Work**, or your Exchange account name).

### 4b. Enable in Settings

1. Open **Settings → Email → Apple Mail & Calendar**.
2. Turn on **Import from Apple Calendar**.
3. Optionally set **Calendar names** (e.g. `Calendar, Work`) — names from the Calendar.app sidebar.
4. Click **Save Apple import settings**.

Set calendar names to match the sidebar in Calendar.app (Exchange calendars are often literally named `Calendar`).

### 4c. Grant Calendars access

The first import runs `scripts/export-apple-calendar.swift`, which uses EventKit.

1. When macOS prompts, allow **Calendars** access for the app running Next (Terminal, iTerm, Cursor, etc.).
2. If you previously denied it: **System Settings → Privacy & Security → Calendars** → enable your app.

### 4d. Run import

1. **Settings → Email → Import from Apple Calendar**
2. If no events appear, verify calendar names in **Settings → Email → Apple Mail & Calendar** match Calendar.app exactly.

---

## Step 5 — Optional: background auto-poll

To re-import Mail and Calendar on a schedule (along with Webex):

1. **Settings → Preferences → App configuration**
2. Enable **Auto-poll integrations**

Apple Mail/Calendar toggles must be enabled in **Settings → Email** for auto-poll to include them.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Buttons grayed out | Email policy still `DRAFT` | Activate email policy |
| Buttons grayed out after activate | Apple import toggles off | Settings → Email → Apple Mail & Calendar |
| Apple Mail: 0 messages | Mail not synced or lookback too short | Sync Mail.app; increase lookback in Settings → Preferences → Advanced integrations |
| Envelope Index / permission errors | Full Disk Access missing | Grant FDA to the app running `npm run next`, then restart it |
| Apple Calendar: access denied | Calendars permission denied | System Settings → Privacy → Calendars |
| Apple Calendar: no calendars matched | Wrong calendar names | Set names in Settings → Email → Apple Mail & Calendar |
| Apple Calendar: timeout | Too many calendars/events | Narrow calendar names in Settings or reduce date window |
| Import works once, not again | Auto-poll off | Enable auto-poll or click import manually |

---

## Security & privacy

- Data stays on your Mac; Next reads local Mail/Calendar caches only.
- Grant the minimum permissions needed (Full Disk Access and Calendars for the app that runs Next).
- Partner rules and allowlists control **priority**, not whether messages are stored — review imported content in the dashboard.

---

## Related docs

- [INSTALL.md](./INSTALL.md) — first-time setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) — ingestion model
