# Install Next from GitHub

This guide is for a **fresh install** — cloning [github.com/briansak/next](https://github.com/briansak/next) and running your own instance on a laptop. **No manual PostgreSQL install and no `.env` editing** — Next manages the database for you.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Homebrew** | Setup installs **Colima** + Docker CLI automatically (no Docker Desktop license) |
| **Git** | To clone and receive updates |
| **(Optional) Ollama** | Local AI summaries — configure in Settings → Preferences |

You do **not** install PostgreSQL yourself or edit `.env` for a normal install. Setup runs:

1. `brew install colima docker docker-compose` (if missing)
2. `colima start` (if not running)
3. `docker compose up` for Postgres, then stops it when setup finishes

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

1. **Install Colima and Docker CLI** via Homebrew (if not already installed)
2. **Start Colima** (if not running)
3. **Create `.env`** automatically (if `.env` doesn’t exist)
4. Run **`npm ci`** — install dependencies
5. **Start Postgres** in Docker, apply schema (`db:push`), seed policies (`db:seed`)
6. **Stop Postgres** — it stays off until you run the app

You do **not** need to copy `.env.example` or edit Webex credentials in a file.

### 3. Start the app

```bash
npm run next
```

- Postgres starts on demand (Colima + Docker Compose)
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

Postgres runs **only while the app or a db command needs it**. Your data **persists** between runs in the Docker volume `next_pgdata`.

| Action | Command | Postgres | Data |
|--------|---------|----------|------|
| Daily dev | `npm run next` | Starts on launch, stops on quit | Kept |
| First install | `npm run setup` | Starts briefly, then stops | Created |
| Schema update | `npm run db:push` | Starts for command | Kept |
| Wipe app data | `npm run db:reset` | Starts for command | Tables wiped, volume kept |
| Full remove | `npm run uninstall` | Container + volume removed | **All DB data gone** |

**Advanced only:** set `NEXT_MANAGE_POSTGRES=false` and your own `DATABASE_URL` if you run Postgres outside Docker (not supported for normal installs).

---

## Uninstall or start over

### Remove all local app data (keep source code)

```bash
npm run uninstall
```

This removes:

- Docker Postgres container and **database volume**
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

On first run, Next auto-creates a single line pointing at the Docker Postgres container. **Do not edit** unless you use an advanced external-database setup.

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/next?schema=public"
```

Optional legacy overrides are listed in [.env.example](../.env.example). Settings in the app UI is preferred for everything else.

Encryption key for stored secrets: auto-created at `.local/encryption.key` (or set `APP_ENCRYPTION_KEY`).

---

## Manual setup (without `npm run setup`)

Requires Colima/Docker:

```bash
node scripts/ensure-colima.mjs
npm ci
node scripts/ensure-env.mjs          # create .env if missing
node scripts/postgres.mjs ensure
npm run db:push
npm run db:seed
node scripts/postgres.mjs stop
npm run next
```

---

## Production (optional)

```bash
npm run build
npm run start
```

Use a managed PostgreSQL instance, set `DATABASE_URL`, and set `NEXT_MANAGE_POSTGRES=false`. Set app public URL in **Settings → Webex**.

---

## Advanced: native Postgres without Colima

If you cannot use Colima/Docker, set in `.env`:

```env
NEXT_POSTGRES_BACKEND=native
```

Then install Postgres binaries:

```bash
brew install postgresql@16
brew link postgresql@16 --force
npm run setup
```

Next stores data in `.local/pgdata` on port **5433** (not Docker). `npm run uninstall` removes that directory.

---

## Advanced: external PostgreSQL

If you cannot use Docker, set in `.env`:

```env
NEXT_MANAGE_POSTGRES=false
DATABASE_URL="postgresql://user:pass@host:5432/next?schema=public"
```

You must install, run, and back up Postgres yourself. `npm run uninstall` will **not** remove this database.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Homebrew is required` | Install Homebrew from [brew.sh](https://brew.sh), then re-run `npm run setup` |
| `Colima started but Docker did not become ready` | Run `colima stop && colima start`, then `npm run setup` |
| `Port 5432 is already in use` | Stop other Postgres on 5432: `brew services stop postgresql@16` |
| `EALLOWSCRIPTS` during `npm ci` / setup | Often caused by `NPM_CONFIG_ALLOW_SCRIPTS` in your shell (mirroring `~/.npmrc`). Setup clears it automatically — run `git pull` and retry. Or remove `export NPM_CONFIG_ALLOW_SCRIPTS=…` from `.zshrc` / `.bashrc`. |
| `Can't reach database server` | Run `colima start`, then `npm run next` |
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
