# Next

Actionable insights from your communications. Next collects, summarizes, and prioritizes messages from **explicitly allowlisted** Webex Spaces and email sources — built to run **locally on your laptop** for one partner coverage workflow.

**Repository:** [github.com/briansak/next](https://github.com/briansak/next)

## Features (MVP)

- **Scoped ingestion** — Webex spaces, Apple Mail/Calendar, and file import (`.eml`, `.pst`, `.ics`). Personal inboxes stay out unless you explicitly import them.
- **Single-user local app** — One account owns the workspace; all data is local to your machine.
- **Heuristic prioritization** — Local rules detect asks, deadlines, and stale threads without cloud LLMs.
- **Next steps board** — Shared action items derived from communications.
- **Optional Ollama** — Richer summaries via a local LLM when available.
- **Browser-configurable settings** — Ollama URL, auto-poll, Gong correlation, partner SLA (secrets stay in `.env`).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design.

## Quick start (new install)

```bash
git clone git@github.com:briansak/next.git
cd next
npm run setup
# edit .env — at minimum SESSION_SECRET and SEED_ADMIN_*
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Full instructions: **[docs/INSTALL.md](docs/INSTALL.md)**

## Getting updates

When new code is published to GitHub:

```bash
npm run update
```

This pulls the latest `main` branch, reinstalls dependencies, and applies database schema changes **without** wiping your data or `.env`.

Details: **[docs/UPDATING.md](docs/UPDATING.md)**

## Stack

- Next.js 15 + TypeScript
- PostgreSQL + Prisma
- Local heuristics engine (Ollama optional)
- Email/password auth (IdP integration planned)

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or `docker compose up -d` for local Postgres)
- (Optional) [Ollama](https://ollama.ai) for enhanced summaries

## Environment variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session encryption secret (`openssl rand -base64 32`) |
| `SEED_PARTNER_NAME` | Partner org name stored on the seeded user |
| `SEED_ADMIN_EMAIL` | Admin email created by `db:seed` |
| `SEED_ADMIN_PASSWORD` | Admin password for `db:seed` |
| `WEBEX_CLIENT_ID` / `WEBEX_CLIENT_SECRET` | Webex OAuth (optional) |
| `OLLAMA_BASE_URL` | Optional; also configurable in Settings UI |

Non-sensitive toggles (Ollama model, auto-poll, SLA, Gong) can be changed in **Settings → Preferences → App configuration** after login.

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run setup` | First-time install (deps, DB, seed) |
| `npm run update` | Pull latest from GitHub + migrate |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production |
| `npm run db:push` | Apply Prisma schema |
| `npm run db:seed` | Create the initial user + policies |
| `npm run db:reset` | Wipe DB and re-seed (destructive) |
| `npm test` | Run unit tests |

## Project structure

```
src/
├── app/              # Next.js pages and API routes
├── components/       # UI components
├── lib/
│   ├── config/       # App configuration (Ollama, poll, SLA)
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
└── update.sh         # Git pull + deps + schema
```

## Privacy

Ingestion is **opt-in per source**. Admins must explicitly allowlist Webex space IDs and email rules before any data is pulled. See architecture doc for guardrails.

## License

MIT — see [LICENSE](LICENSE).
