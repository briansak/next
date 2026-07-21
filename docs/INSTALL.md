# Install Next from GitHub

This guide is for anyone cloning [github.com/briansak/next](https://github.com/briansak/next) and running their own instance.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **PostgreSQL 15+** | Or use the included Docker Compose database |
| **Git** | To clone and receive updates |
| **(Optional) Docker** | Easiest way to run Postgres locally |
| **(Optional) Ollama** | Local AI summaries — configurable in the UI |

## 1. Clone the repository

```bash
git clone git@github.com:briansak/next.git
cd next
```

HTTPS:

```bash
git clone https://github.com/briansak/next.git
cd next
```

## 2. Run the setup script

```bash
npm run setup
```

This will:

1. Copy `.env.example` → `.env` (if `.env` does not exist)
2. Run `npm ci`
3. Start Postgres via `docker compose up -d` (when Docker is available)
4. Run `npm run db:push` and `npm run db:seed`

## 3. Configure your environment

Edit `.env` before or after setup. At minimum:

```bash
# Generate: openssl rand -base64 32
SESSION_SECRET="your-random-secret"

# Your admin account (created by db:seed)
SEED_ADMIN_EMAIL="you@example.com"
SEED_ADMIN_PASSWORD="choose-a-strong-password"
SEED_ADMIN_NAME="Your Name"

# Partner you cover (optional — defaults in seed)
SEED_PARTNER_NAME="Acme Corp"
```

Re-run seed after changing seed values on a **fresh** database:

```bash
npm run db:seed
```

Integration secrets (Webex OAuth, etc.) stay in `.env`. Non-sensitive toggles (Ollama URL, auto-poll, SLA) can be changed in **Settings → Preferences → App configuration** after login.

See [.env.example](../.env.example) for the full list.

## 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Sign in:**

- Use `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` (when seed created the account), or
- On a fresh install with no seed admin, use `/register` once to create your local account.

This app supports **one account per install**. Registration is disabled after the first user exists.

## Upgrading from an older multi-tenant database

The schema changed significantly. On your laptop, reset the local database:

```bash
npm run db:reset
```

Then sign in with the seeded admin from `.env`.

## 5. Configure your instance

After login:

1. **Settings → Email** — partner domains, subject prefixes, email import
2. **Settings → Webex** — connect Webex and allowlist spaces
3. **Settings → Preferences** — Ollama, auto-poll, Gong correlation, SLA

## Manual setup (without the script)

```bash
cp .env.example .env
# edit .env
docker compose up -d   # optional
npm ci
npm run db:push
npm run db:seed
npm run dev
```

## Production (optional)

```bash
npm run build
npm run start
```

Set `NEXT_PUBLIC_APP_URL` to your public URL. Use a managed PostgreSQL instance and a strong `SESSION_SECRET`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Can't reach database server` | Start Postgres: `docker compose up -d` or fix `DATABASE_URL` |
| Registration blocked | One account per install — sign in instead |
| Webex connect fails | Set `WEBEX_CLIENT_ID`, `WEBEX_CLIENT_SECRET`, `WEBEX_REDIRECT_URI` in `.env` |
| Apple Mail import empty | Grant Full Disk Access to your terminal/IDE; see Settings → Email |

## Getting updates

When the maintainer publishes changes to GitHub:

```bash
npm run update
```

See [UPDATING.md](./UPDATING.md) for details, forks, and merge conflicts.
