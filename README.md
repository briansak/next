# Next

Actionable insights from your communications. Next collects, summarizes, and prioritizes messages from **explicitly allowlisted** Webex Spaces and email sources — built to run **locally on your laptop** for partner coverage workflow.

**Repository:** [github.com/briansak/next](https://github.com/briansak/next)

## Features (MVP)

- **Scoped ingestion** — Webex spaces, Apple Mail/Calendar, and file import (`.eml`, `.pst`, `.ics`). Personal inboxes stay out unless you explicitly import them.
- **Single-user local app** — One account owns the workspace; all data is local to your machine.
- **Heuristic prioritization** — Local rules detect asks, deadlines, and stale threads without foundation LLMs.
- **Next steps board** — Action items derived from communications.
- **Optional Ollama** — Richer summaries via a local LLM when available.
- **Browser-configurable settings** — Webex OAuth, Ollama, auto-poll, Apple import, Gong, SLA, and more.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design.

## Quick start (new install)

**Prerequisites:** Node.js 20+, **Homebrew** (macOS — setup installs Colima automatically), Git.

```bash
git clone git@github.com:briansak/next.git
cd next
npm run setup
npm run next
```

That’s it for a first run:

1. **`npm run setup`** — installs Colima/Docker CLI if needed, installs dependencies, auto-creates `.env`, starts Postgres in Docker briefly, applies schema, seeds policies, then stops Postgres.
2. **`npm run next`** — starts Postgres on demand, opens your browser, runs the server. On first launch you complete the setup questionnaire; afterward you land on **My Priorities**.

Configure Webex, Ollama, and everything else in **Settings**.

Full guide: **[docs/INSTALL.md](docs/INSTALL.md)** · Webex: **[docs/WEBEX_GETTING_STARTED.md](docs/WEBEX_GETTING_STARTED.md)**

## Daily use

```bash
npm run next    # start app (Postgres starts/stops with the app)
```

Your browser opens automatically targeted at http://localhost:3000.

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
- PostgreSQL + Prisma (Colima + Docker Compose)
- Local heuristics engine (Ollama optional)

## Prerequisites

| Required | Purpose |
|----------|---------|
| **Node.js 20+** | App runtime |
| **Homebrew** | Setup uses it to install **Colima** and the Docker CLI |
| **Git** | Clone and updates |

On **`npm run setup`**, Next installs Colima + Docker CLI via Homebrew (if missing), starts Colima, and runs PostgreSQL in Docker.

## Configuration

Webex, local mail/calendar, and additional settingas are configured in the app:

| Setting | Where |
|---------|--------|
| Webex OAuth (client ID/secret, scopes) | **Settings → Webex** (encrypted locally) |
| Ollama URL and model | **Settings → Preferences** |
| Auto-poll, Gong, SLA | **Settings → Preferences** |
| Apple Mail/Calendar import | **Settings → Email** |
| PST import, Whisper, poll secret | **Settings → Preferences → Advanced integrations** |

**Advanced only:** An existing Postgres database can be used without Colima — see [docs/INSTALL.md](docs/INSTALL.md).

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
├── ensure-colima.mjs    # Install/start Colima during setup
├── postgres.mjs         # Postgres backend router
├── postgres-docker.mjs  # docker-compose Postgres
├── postgres-native.mjs  # Advanced: .local/pgdata via pg_ctl
└── dev-server.mjs    # npm run next
```

## Privacy

Ingestion is **opt-in per source**. You must explicitly allowlist Webex spaces and email rules before any data is pulled. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for guardrails. All SLM/LLM work is done locally, no need for API-driven connections.

## License

MIT — see [LICENSE](LICENSE).
