# Next — Architecture

## Overview

Next is a **single-user local** web application that ingests **explicitly allowlisted** communications (Webex Spaces, Email), summarizes them with local heuristics (and optionally a local Ollama instance), and helps you prioritize next steps for partner coverage.

## Design principles

1. **Opt-in ingestion only** — Nothing is pulled unless you configure it. Personal inboxes and unrelated spaces are never touched.
2. **Local-first** — One user account owns all data on your machine. No tenant isolation layer.
3. **Heuristics first** — Rule-based prioritization ships in MVP. LLM summarization is an optional enhancement via local Ollama.
4. **Auditability** — Every ingested item records its source, allowlist rule, and ingestion timestamp.

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack TypeScript, API routes, SSR for dashboard |
| Language | TypeScript | Shared types across UI, API, and integrations |
| Database | PostgreSQL | Relational model for allowlists, threads, and user preferences |
| ORM | Prisma | Schema-first, migrations, type-safe queries |
| Auth | Email/password (MVP) → IdP later | Simple sessions; SSO migration path |
| Jobs | Inngest or cron (MVP) | Background sync for Webex spaces and email |
| LLM (optional) | Ollama (local HTTP) | No cloud dependency; user-controlled |

Stack can change if integration complexity or scale demands it (e.g. dedicated worker service).

## Data model (single user)

```
User (one account per install)
├── partnerName, appConfig, dashboard preferences
├── IngestionPolicies (allowlists)
│   ├── WebexSpaceAllowlist — space IDs explicitly enabled
│   └── EmailAllowlist — addresses, domains, or shared mailbox rules
├── IntegrationTokens (Webex OAuth, etc.)
├── Communications (ingested messages)
├── Summaries (heuristic or LLM-generated)
└── NextSteps (action items)
```

### Privacy & ingestion guardrails

Ingestion **never** runs without an active `IngestionPolicy`:

| Source | Allowlist mechanism | Blocked by default |
|--------|---------------------|-------------------|
| Webex | Space ID list on your policies | All spaces |
| Email | Shared mailbox + sender/domain filters | Personal inboxes, unmatched senders |

Additional safeguards:

- Policies require explicit enable before first sync
- Dry-run mode: preview what would be ingested before enabling
- `sourceRef` on every `Communication` links back to the matching allowlist rule
- PII minimization: store message excerpts, not full attachments, in MVP

## Data flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Webex API   │────▶│ Ingestion Worker │────▶│ Communications  │
│ Microsoft   │────▶│ Ingestion Worker │────▶│ Communications  │
│ 365 Graph   │     │ (policy-gated)   │     │ Communications  │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                      ┌──────────────────┐            ▼
                      │ Heuristics Engine│◀─── Summarize & Score
                      │ (+ Ollama opt.)  │
                      └────────┬─────────┘
                               ▼
                      ┌──────────────────┐
                      │ Dashboard +      │
                      │ Next Steps board │
                      └──────────────────┘
```

## Heuristics (MVP)

Priority scoring uses weighted signals:

| Signal | Weight | Example |
|--------|--------|---------|
| Explicit ask | High | "Can you...", "Please review", "Need by Friday" |
| Deadline mention | High | Dates, "EOD", "ASAP", "urgent" |
| Unanswered thread | Medium | No reply in N days from team member |
| @mention | Medium | Direct mention of team member |
| Stale follow-up | Medium | Prior next step still open |
| Noise | Negative | FYI, automated notifications, out-of-office |

Output: `priority` (1–5), `suggestedAction`, `extractedDeadline`, `tags[]`.

## Integrations

### Webex Spaces

- OAuth 2.0 via Webex integrations ([developer.webex.com](https://developer.webex.com))
- REST API for messages + webhooks (equivalent to Messaging MCP tools)
- Optional: Messaging MCP server (`https://mcp.webexapis.com/mcp/webex-messaging`) for agent workflows — see [WEBEX_INGESTION.md](WEBEX_INGESTION.md)
- Poll or webhook for messages in **allowlisted space IDs only**
- Normalize to `Communication` with `source: WEBEX`, `threadId`, `author`, `body`, `timestamp`

### Email (file import and Apple Mail)

- Import `.eml`, `.zip`, `.pst`, `.mbox`, and `.ics` from Settings → Email
- Optional Apple Mail / Apple Calendar sync on Mac — see [APPLE_MAIL_CALENDAR_GETTING_STARTED.md](./APPLE_MAIL_CALENDAR_GETTING_STARTED.md)
- Filter by partner email rules for priority boosts
- Normalize to `Communication` with `source: EMAIL`, `messageId`, `subject`, `body`, `timestamp`

## Initial setup (seed)

Run `npm run setup` (or `npm run db:seed`) after install. Seed creates ingestion policies only — your profile is created during first-launch setup at `/setup`.

Install and update guides: [INSTALL.md](./INSTALL.md), [UPDATING.md](./UPDATING.md).

## Example partner (WWT)

- Partner: World Wide Technology
- Default email allowlist: `@wwt.com` domain and `[WWT]` subject prefix
- Webex policy seeded in DRAFT — spaces must be explicitly added
- Run `npm run db:seed` to create the local admin user

## API surface (planned)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/communications` | List prioritized communications |
| `GET /api/next-steps` | Next steps board |
| `POST /api/next-steps` | Create/update next step |
| `GET/POST /api/ingestion-policies` | Manage allowlists |
| `POST /api/ingestion/sync` | Trigger manual sync |

## Deployment (future)

- App: Vercel, Railway, or self-hosted Docker
- DB: Managed PostgreSQL
- Workers: Separate process or Inngest for ingestion jobs
- Ollama: Runs locally on your laptop

## MVP milestones

1. **Foundation** — Repo, schema, single-user auth, local install
2. **Ingestion policies** — CRUD for Webex space and email allowlists
3. **Webex connector** — OAuth + poll allowlisted spaces
4. **Email connector** — IMAP/API with sender filters
5. **Heuristics** — Score and summarize communications
6. **Dashboard** — Prioritized feed + next steps board
7. **Ollama (optional)** — Enhanced summaries when local instance available
