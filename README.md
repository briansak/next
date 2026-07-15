# Next

Actionable insights from team communications. Next collects, summarizes, and prioritizes messages from **explicitly allowlisted** Webex Spaces and email sources — so teams covering a single partner can collaborate on what to do next.

## Features (MVP)

- **Scoped ingestion** — Microsoft 365 shared mailbox + Webex spaces, allowlisted only. Personal inboxes stay out.
- **Multi-tenant** — Teams work in isolated workspaces with roles (admin, member, viewer).
- **Heuristic prioritization** — Local rules detect asks, deadlines, and stale threads without cloud LLMs.
- **Next steps board** — Shared action items derived from communications.
- **Optional Ollama** — Richer summaries via a local LLM when available.

## Stack

- Next.js 15 + TypeScript
- PostgreSQL + Prisma
- Local heuristics engine (Ollama optional)
- Email/password auth (IdP integration planned)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design.

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- (Optional) [Ollama](https://ollama.ai) for enhanced summaries

### Setup

**1. Start PostgreSQL**

If you have Docker:

```bash
docker compose up -d
```

Or use an existing Postgres instance and set `DATABASE_URL` in `.env`.

**2. Initialize the database**

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Create tables and seed WWT tenant
npm run db:push
npm run db:seed

# Start dev server
npm run dev
```

Default admin (from seed):

- Email: `admin@example.com` (override with `SEED_ADMIN_EMAIL`)
- Password: `changeme123` (override with `SEED_ADMIN_PASSWORD`)

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session encryption secret |
| `SEED_ADMIN_EMAIL` | WWT pilot admin email for `db:seed` |
| `SEED_ADMIN_PASSWORD` | WWT pilot admin password for `db:seed` |
| `MICROSOFT_CLIENT_ID` | Azure AD app client ID |
| `MICROSOFT_CLIENT_SECRET` | Azure AD app client secret |
| `MICROSOFT_TENANT_ID` | Azure AD tenant ID |
| `MICROSOFT_SHARED_MAILBOX` | Shared partner mailbox UPN |
| `WEBEX_CLIENT_ID` | Webex integration client ID |
| `WEBEX_CLIENT_SECRET` | Webex integration client secret |
| `OLLAMA_BASE_URL` | Optional. e.g. `http://localhost:11434` |

## Project structure

```
src/
├── app/              # Next.js pages and API routes
├── components/       # UI components
├── lib/
│   ├── db/           # Prisma client
│   ├── heuristics/   # Priority scoring and summarization
│   ├── integrations/ # Webex and email connectors
│   └── tenant/       # Multi-tenant scoping helpers
prisma/
└── schema.prisma     # Data model
docs/
└── ARCHITECTURE.md
```

## Privacy

Ingestion is **opt-in per source**. Admins must explicitly allowlist Webex space IDs and email rules before any data is pulled. See architecture doc for guardrails.

## License

Private — not yet published.
