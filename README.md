# Next

Actionable insights from your communications. Next collects, summarizes, and prioritizes messages from **explicitly allowlisted** Webex Spaces and email sources — built to run **locally on your laptop** for one partner coverage workflow.

**Repository:** [github.com/briansak/next](https://github.com/briansak/next)

## Features (MVP)

- **Scoped ingestion** — Webex spaces, Apple Mail/Calendar, and file import (`.eml`, `.pst`, `.ics`). Personal inboxes stay out unless you explicitly import them.
- **Single-user local app** — One account owns the workspace; all data is local to your machine.
- **Heuristic prioritization** — Local rules detect asks, deadlines, and stale threads without cloud LLMs.
- **Next steps board** — Shared action items derived from communications.
- **Optional Ollama** — Richer summaries via a local LLM when available.
- **Browser-configurable settings** — Webex OAuth, Ollama, auto-poll, Apple import, Gong, SLA, and more — no manual `.env` editing for normal use.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design.

## Quick start (new install)

**Prerequisites:** Node.js 20+, **Postgres runtime** (see below — no Docker Desktop license required), Git.

```bash
git clone git@github.com:briansak/next.git
cd next
npm run setup
npm run next
```

That’s it for a first run:

1. **`npm run setup`** — checks for a Postgres runtime, installs dependencies, auto-creates `.env`, starts Postgres briefly, applies schema, seeds policies, then stops Postgres.
2. **`npm run next`** — starts Postgres on demand, opens your browser, runs the dev server. On first launch you complete the setup questionnaire; afterward you land on **My Priorities**.

Configure Webex, Ollama, and everything else in **Settings** — not in `.env`.

Full guide: **[docs/INSTALL.md](docs/INSTALL.md)** · Webex: **[docs/WEBEX_GETTING_STARTED.md](docs/WEBEX_GETTING_STARTED.md)**

## Daily use

```bash
npm run next    # start app (Postgres starts/stops with the app)
```

Your browser opens automatically. Quit with `Ctrl+C` — Postgres stops, but **your data persists** in the Docker volume until you uninstall or reset.

## Getting updates

```bash
npm run update
```

Pulls latest `main`, reinstalls dependencies, applies schema changes **without** wiping your data.

Details: **[docs/UPDATING.md](docs/UPDATING.md)**

## Remove local data or the app

```bash
npm run uninstall   # delete Docker DB volume + encryption key (.local/)
```

Then either run `npm run setup` for a fresh install, or delete the project folder to remove the app entirely.

| Command | What it does |
|---------|----------------|
| `npm run uninstall` | Remove database volume and `.local/` secrets key |
| `npm run db:reset` | Wipe app data in DB, re-seed policies (re-run `/setup`) |
| Delete project folder | Remove the application source |

## Stack

- Next.js 15 + TypeScript
- PostgreSQL + Prisma (bundled via Colima/Docker **or** `.local/pgdata` — no Docker Desktop license)
- Local heuristics engine (Ollama optional)
- No login — first-launch setup questionnaire

## Prerequisites

| Required | Purpose |
|----------|---------|
| **Node.js 20+** | App runtime |
| **Postgres runtime** | Database — auto-detected; see options below |
| **Git** | Clone and updates |

You do **not** install PostgreSQL manually, edit `.env`, or pay for Docker Desktop.

### Postgres runtime (pick one — both free for organizations)

**Option A — Colima + Docker CLI** (uses included `docker-compose.yml`):

```bash
brew install colima docker docker-compose
colima start
```

**Option B — Homebrew PostgreSQL** (no containers; data in `.local/pgdata`):

```bash
brew install postgresql@16
brew link postgresql@16 --force
```

Setup auto-detects: Colima/Docker if `docker info` works, otherwise Homebrew Postgres. Force a backend with `NEXT_POSTGRES_BACKEND=docker` or `NEXT_POSTGRES_BACKEND=native`.

## Configuration (no `.env` editing required)

A minimal `.env` is **auto-created** on first `npm run setup` or `npm run next` with the correct URL for your Postgres backend. You should not need to edit it.

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/next?schema=public"
```

Everything else is configured in the app:

| Setting | Where |
|---------|--------|
| Webex OAuth (client ID/secret, scopes) | **Settings → Webex** (encrypted locally) |
| Ollama URL and model | **Settings → Preferences** |
| Auto-poll, Gong, SLA | **Settings → Preferences** |
| Apple Mail/Calendar import | **Settings → Email** |
| PST import, Whisper, poll secret | **Settings → Preferences → Advanced integrations** |

Optional legacy `.env` overrides are documented in [.env.example](.env.example).

**Advanced only:** set `NEXT_MANAGE_POSTGRES=false` and provide your own `DATABASE_URL` if you run Postgres outside Docker (not supported for normal installs).

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run setup` | First-time install (deps, schema, seed) |
| `npm run next` | Dev server — starts Postgres when needed, stops on exit, opens browser |
| `npm run dev` | Alias for `npm run next` |
| `npm run uninstall` | Remove local DB volume and encryption key |
| `npm run update` | Pull latest from GitHub + migrate schema |
| `npm run build` / `npm start` | Production |
| `npm run db:push` | Apply Prisma schema |
| `npm run db:seed` | Seed ingestion policies |
| `npm run db:reset` | Wipe DB tables and re-seed (destructive) |
| `npm test` | Run unit tests |

## Local database lifecycle

Postgres runs **only while needed**:

- **`npm run next`** — Docker Postgres starts if needed; **stops when you quit** the dev server (if this session started it). Data stays in the Docker volume.
- **`npm run setup`** / **`db:*` commands** — start Postgres temporarily for the command. Setup stops Postgres when finished.
- **`npm run uninstall`** — removes Docker volume **or** `.local/pgdata`, plus encryption key.
- **`npm run db:reset`** — wipe tables but keep the volume; complete `/setup` again.

## Project structure

```
src/
├── app/              # Next.js pages and API routes
├── components/       # UI components
├── lib/
│   ├── config/       # App configuration store
│   ├── secrets/      # Encrypted credential storage
│   ├── db/           # Prisma client
│   ├── heuristics/   # Priority scoring and summarization
│   ├── integrations/ # Webex and email connectors
│   └── user/         # User preferences and profile
prisma/
└── schema.prisma     # Data model
docs/
├── INSTALL.md        # Install guide for new users
├── UPDATING.md       # How to pull latest code
└── ARCHITECTURE.md
scripts/
├── setup.sh          # First-time setup
├── update.sh         # Git pull + deps + schema
├── uninstall.mjs     # Remove local DB volume + secrets
├── postgres.mjs         # Postgres backend router (Docker/Colima or native)
├── postgres-docker.mjs  # docker-compose Postgres
├── postgres-native.mjs  # .local/pgdata via pg_ctl
└── dev-server.mjs    # npm run next
```

## Privacy

Ingestion is **opt-in per source**. You must explicitly allowlist Webex spaces and email rules before any data is pulled. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for guardrails.

## License

MIT — see [LICENSE](LICENSE).
