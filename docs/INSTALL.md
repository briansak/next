# Install Next from GitHub

This guide is for a **fresh install** — cloning [github.com/briansak/next](https://github.com/briansak/next) and running your own instance on a laptop. No manual `.env` editing is required for the standard Docker Postgres setup.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Docker** | Recommended — Next manages local Postgres via Docker Compose |
| **Git** | To clone and receive updates |
| **(Optional) Ollama** | Local AI summaries — configure in Settings → Preferences |

If you don’t use Docker, you need PostgreSQL 15+ running elsewhere and a custom `DATABASE_URL` in `.env`.

---

## Fresh install (recommended)

### 1. Clone the repository

```bash
git clone git@github.com:briansak/next.git
cd next
```

HTTPS:

```bash
git clone https://github.com/briansak/next.git
cd next
```

### 2. Run setup

```bash
npm run setup
```

This will:

1. **Create `.env`** automatically with the default local Postgres URL (if `.env` doesn’t exist)
2. Run **`npm ci`** — install dependencies
3. **Start Postgres briefly** via Docker, apply schema (`db:push`), seed policies (`db:seed`)
4. **Stop Postgres** — it stays off until you run the app

You do **not** need to copy `.env.example` or edit Webex credentials in a file.

### 3. Start the app

```bash
npm run next
```

- Postgres starts on demand (Docker)
- Your browser opens to [http://localhost:3000](http://localhost:3000)
- **First launch:** complete the setup questionnaire at `/setup`
- **After setup:** you go straight to **My Priorities** (`/dashboard`)

Quit with `Ctrl+C`. Postgres stops, but your data persists in the Docker volume for the next run.

---

## First-launch setup questionnaire

The wizard asks for:

1. **Your name** and **partner organization**
2. **Email rules** (domains, subject prefixes) — optional
3. **Preferences** — Ollama, auto-poll, Apple import toggles
4. **Webex** — optional; connect after saving OAuth credentials in Settings

No login or registration. Everything can be changed later in **Settings**.

---

## Configure in Settings (not `.env`)

| What | Where |
|------|--------|
| Webex Client ID, secret, scopes, redirect URI | **Settings → Webex** (encrypted on disk) |
| Ollama URL and model | **Settings → Preferences → App configuration** |
| Auto-poll, Gong correlation, partner SLA | **Settings → Preferences → App configuration** |
| Apple Mail / Calendar import | **Settings → Email** |
| PST import, Whisper transcription, poll secret | **Settings → Preferences → Advanced integrations** |

Webex walkthrough: [WEBEX_GETTING_STARTED.md](./WEBEX_GETTING_STARTED.md)

Apple Mail/Calendar: [APPLE_MAIL_CALENDAR_GETTING_STARTED.md](./APPLE_MAIL_CALENDAR_GETTING_STARTED.md)

---

## Local database lifecycle

Postgres runs **only while the app or a db command needs it**. Your data **persists** between runs in Docker volume `next_pgdata`.

| Action | Command | Postgres | Data |
|--------|---------|----------|------|
| Daily dev | `npm run next` | Starts on launch, stops on quit | Kept |
| First install | `npm run setup` | Starts briefly, then stops | Created |
| Schema update | `npm run db:push` | Starts for command | Kept |
| Wipe app data | `npm run db:reset` | Starts for command | Tables wiped, volume kept |
| Full remove | `npm run uninstall` | Container + volume removed | **All DB data gone** |

Set `NEXT_MANAGE_POSTGRES=false` in `.env` if you use your own Postgres server (Next won’t start/stop Docker).

---

## Uninstall or start over

### Remove all local app data (keep source code)

```bash
npm run uninstall
```

This removes:

- Docker Postgres container and **database volume** (all communications, settings, Webex tokens)
- `.local/` encryption key (Webex client secret storage)

It keeps the project folder and `.env`. To reinstall:

```bash
npm run setup
npm run next
```

Complete `/setup` again as a new user.

### Remove the app entirely

After `npm run uninstall`, delete the project folder.

### Wipe data but keep Docker volume

```bash
npm run db:reset
```

Then open `/setup` and complete the questionnaire again.

---

## `.env` — what’s actually in it?

On first run, Next auto-creates:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/next?schema=public"
```

That matches [docker-compose.yml](../docker-compose.yml). **Edit only if** Postgres runs on a different host, port, or database name.

Optional overrides are listed in [.env.example](../.env.example) (legacy fallbacks only — Settings is preferred).

Encryption key for stored secrets: auto-created at `.local/encryption.key` (or set `APP_ENCRYPTION_KEY`).

---

## Manual setup (without `npm run setup`)

```bash
npm ci
node scripts/ensure-env.mjs          # create .env if missing
node scripts/postgres-docker.mjs ensure
npm run db:push
npm run db:seed
node scripts/postgres-docker.mjs stop
npm run next
```

---

## Production (optional)

```bash
npm run build
npm run start
```

Use a managed PostgreSQL instance and set `DATABASE_URL` accordingly. Set app public URL in **Settings → Webex** (or legacy `NEXT_PUBLIC_APP_URL` in `.env`).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Can't reach database server` | Install/start Docker, or run `npm run next` (starts Postgres). Check `DATABASE_URL`. |
| Stuck on setup / schema errors | `npm run db:reset` then complete `/setup` again |
| Webex connect button missing | Save Client ID and secret in **Settings → Webex**, then Connect |
| `redirect_uri_mismatch` | Redirect URI in developer.webex.com must match **Settings → Webex** exactly |
| Webex stops after ~12 hours | Use OAuth integration (not personal token); enable auto-poll; see [WEBEX_GETTING_STARTED.md](./WEBEX_GETTING_STARTED.md) |
| Apple Mail import empty | Grant Full Disk Access to Terminal/Cursor; enable toggles in **Settings → Email** — see [APPLE_MAIL_CALENDAR_GETTING_STARTED.md](./APPLE_MAIL_CALENDAR_GETTING_STARTED.md) |
| Want a completely clean slate | `npm run uninstall` then `npm run setup` |

---

## Getting updates

```bash
npm run update
```

See [UPDATING.md](./UPDATING.md) for forks, merge conflicts, and rollbacks.
