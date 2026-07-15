# Next — Architecture

## Overview

Next is a multi-tenant web application that ingests **explicitly allowlisted** communications (Webex Spaces, Email), summarizes them with local heuristics (and optionally a local Ollama instance), and helps teams collaborate on prioritized next steps.

## Design principles

1. **Opt-in ingestion only** — Nothing is pulled unless a tenant admin configures it. Personal inboxes and unrelated spaces are never touched.
2. **Tenant isolation** — All data is scoped by `tenantId`. Cross-tenant access is impossible at the query layer.
3. **Heuristics first** — Rule-based prioritization ships in MVP. LLM summarization is an optional enhancement via local Ollama.
4. **Auditability** — Every ingested item records its source, allowlist rule, and ingestion timestamp.

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack TypeScript, API routes, SSR for dashboard |
| Language | TypeScript | Shared types across UI, API, and integrations |
| Database | PostgreSQL | Relational model fits tenants, allowlists, threads |
| ORM | Prisma | Schema-first, migrations, type-safe queries |
| Auth | Email/password (MVP) → IdP later | Simple sessions; SSO migration path |
| Jobs | Inngest or cron (MVP) | Background sync for Webex spaces and email |
| LLM (optional) | Ollama (local HTTP) | No cloud dependency; tenant-controlled |

Stack can change if integration complexity or scale demands it (e.g. dedicated worker service).

## Multi-tenancy model

```
Organization (Tenant)
├── Users (members with roles: admin, member, viewer)
├── Partner (the external entity this team covers)
├── IngestionPolicies (allowlists)
│   ├── WebexSpaceAllowlist — space IDs explicitly enabled
│   └── EmailAllowlist — addresses, domains, or shared mailbox rules
├── Communications (ingested messages)
├── Summaries (heuristic or LLM-generated)
└── NextSteps (collaborative action items)
```

### Roles

- **Admin** — Configure ingestion policies, manage members, connect integrations
- **Member** — View communications, create/update next steps, assign owners
- **Viewer** — Read-only access to summaries and next steps

### Privacy & ingestion guardrails

Ingestion **never** runs without an active `IngestionPolicy`:

| Source | Allowlist mechanism | Blocked by default |
|--------|---------------------|-------------------|
| Webex | Space ID list per tenant | All spaces |
| Email | Shared mailbox + sender/domain filters | Personal inboxes, unmatched senders |

Additional safeguards:

- Policies require admin approval before first sync
- Dry-run mode: preview what would be ingested before enabling
- `sourceRef` on every `Communication` links back to the matching allowlist rule
- PII minimization: store message excerpts, not full attachments, in MVP

## Data flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Webex API   │────▶│ Ingestion Worker │────▶│ Communications  │
│ Microsoft   │────▶│ Ingestion Worker │────▶│ Communications  │
│ 365 Graph   │     │ (policy-gated)   │     │ (tenant-scoped) │
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

### Email (Microsoft 365)

- OAuth 2.0 via Azure AD app registration
- Graph API `Mail.Read` / `Mail.Read.Shared` on a **shared partner mailbox**
- Filter by `EmailAllowlist` (from address, domain, subject prefix)
- Normalize to `Communication` with `source: EMAIL`, `messageId`, `subject`, `body`, `timestamp`
- Personal inboxes must never be configured as the shared mailbox

## Pilot tenant

**World Wide Technology (WWT)** is the initial pilot tenant (`slug: wwt`):

- Partner: World Wide Technology
- Default email allowlist: `@wwt.com` domain and `[WWT]` subject prefix
- Webex policy seeded in DRAFT — spaces must be explicitly added
- Run `npm run db:seed` to create tenant and admin user

## API surface (planned)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/communications` | List prioritized communications for tenant |
| `GET /api/next-steps` | Collaborative next steps board |
| `POST /api/next-steps` | Create/update next step |
| `GET/POST /api/ingestion-policies` | Manage allowlists (admin) |
| `POST /api/ingestion/sync` | Trigger manual sync (admin) |

## Deployment (future)

- App: Vercel, Railway, or self-hosted Docker
- DB: Managed PostgreSQL
- Workers: Separate process or Inngest for ingestion jobs
- Ollama: Runs on tenant infra or shared internal host

## MVP milestones

1. **Foundation** — Repo, schema, tenant model, auth stub
2. **Ingestion policies** — CRUD for Webex space and email allowlists
3. **Webex connector** — OAuth + poll allowlisted spaces
4. **Email connector** — IMAP/API with sender filters
5. **Heuristics** — Score and summarize communications
6. **Dashboard** — Prioritized feed + next steps board
7. **Ollama (optional)** — Enhanced summaries when local instance available
