# Webex Ingestion — MCP, A2A, and REST

## Short answer

| Protocol | Use for Next ingestion? | Why |
|----------|-------------------------|-----|
| **Messaging MCP** | Yes — useful, optional layer | Official tools for search, spaces, webhooks; wraps the same REST APIs |
| **Meetings MCP** | No (for MVP) | Meetings/transcripts — not space message ingestion |
| **A2A** | No — wrong direction | Connects agents *to each other*, not apps *to Webex data* |

**Recommendation:** Build ingestion on the **Webex REST API** (webhooks + poll). Optionally call the **Messaging MCP server** later for agent/Ollama workflows — not as the core ingestion transport.

## Messaging MCP (developer.webex.com)

Cisco hosts an official Messaging MCP server:

- **URL:** `https://mcp.webexapis.com/mcp/webex-messaging`
- **Docs:** [Messaging MCP Server](https://developer.webex.com/mcp/docs/messaging-mcp-server)

### Ingestion-relevant tools

| MCP tool | Maps to ingestion step |
|----------|------------------------|
| `webex-search-messages` | Poll allowlisted spaces (`roomId` + date filters) |
| `webex-get-message` | Fetch single message / thread context |
| `webex-search-spaces` | Discover space IDs during admin setup |
| `webex-get-space` | Validate allowlisted space exists |
| `webex-create-webhook` | Push ingestion when messages arrive |
| `webex-get-webhook` / `webex-update-webhook` | Manage subscriptions |

Under the hood, these tools call `webexapis.com` REST endpoints — same as our direct integration.

### Prerequisites

1. **Control Hub:** Org admin must enable the Messaging MCP server
2. **OAuth integration** with scopes:
   - `spark:mcp` (required for MCP connection)
   - `spark:messages_read`
   - `spark:rooms_read`
   - `spark:webhooks_read` / `spark:webhooks_write` (for push ingestion)
3. **Auth:** OAuth 2.0 bearer token (preferred for server apps) or WCIT with scope elicitation (better for interactive AI clients like Cursor)

### When MCP helps Next

- **Agent workflows:** "Summarize this space" via Ollama using MCP tools in Cursor
- **Rapid prototyping:** Test space search without hand-coding REST calls
- **Future:** Next could act as an MCP *client* in an enrichment step

### When REST is better (our MVP path)

- Deterministic background sync jobs
- Webhook HMAC verification
- Multi-tenant token storage and allowlist enforcement
- No dependency on MCP client runtime or Control Hub MCP enablement for basic operation

Webex's own guidance: use **APIs for production apps**, **MCP for AI agent integration**.

## A2A (Agent-to-Agent)

A2A is for **registering your app as an agent** that other agents discover and delegate tasks to — via an Agent Card at `/.well-known/agent-card.json`.

- **Beta program** enrollment required
- You **host** the A2A server; Webex/other agents call **you**
- Use case: "Hey Next agent, prioritize my team's open threads" from another Webex agent

A2A does **not** pull messages from Webex spaces. It's the inverse — external agents talk to Next.

**Possible future:** Expose Next as an A2A agent that returns prioritized next steps. Not for ingestion.

## Architecture for Next

```
Allowlisted Webex Spaces
        │
        ├─► Webhook (REST) ──► POST /api/integrations/webex/webhook
        │                              │
        └─► Poll fallback (REST) ────────┤
                                       ▼
                              Allowlist gate (roomId)
                                       ▼
                              Heuristics engine
                                       ▼
                              Communication (tenant-scoped)
```

### Privacy guardrails (unchanged)

- Only `WebexSpaceAllowlist` space IDs are ingested
- Webhook handler rejects events for non-allowlisted `roomId`
- Policy must be `ACTIVE` before sync or webhook registration

## Optional: MCP client layer (phase 2)

If you want MCP in the stack without replacing REST:

```typescript
// Ingestion worker uses REST (deterministic)
await fetchAllowlistedMessages(token, allowlist);

// Agent enrichment uses Messaging MCP (exploratory)
// mcpClient.callTool("webex-search-messages", { roomId, ... })
```

Both require the same OAuth token and allowlist checks.

## Setup checklist

1. Create Webex integration at [developer.webex.com](https://developer.webex.com)
2. **Check scopes on the integration** — must match `.env` exactly (see Scope modes below)
3. Redirect URI: `http://localhost:3000/api/integrations/webex/callback`
4. Add WWT space IDs to ingestion policy (DRAFT → ACTIVE)
5. Connect Webex in `/settings/ingestion`
6. Register webhooks (requires public `NEXT_PUBLIC_APP_URL` — use ngrok for local dev)
7. Trigger manual sync: `POST /api/integrations/webex/sync`

## Scope modes

Webex returns `invalid_scope` if the app requests scopes not **checked** on your integration.

Set `WEBEX_SCOPE_MODE` in `.env` (or explicit `WEBEX_SCOPES`):

| Mode | Scopes | When to use |
|------|--------|-------------|
| `standard` (default) | `spark:messages_read` `spark:rooms_read` | Authenticating user is a **member** of the allowlisted spaces |
| `compliance` | `spark-compliance:messages_read` `spark-compliance:rooms_read` | **Org-wide** read; user has compliance/admin role |
| `standard+webhooks` | standard + `spark:webhooks_*` | Push ingestion, user-level webhooks |
| `compliance+webhooks` | compliance + `spark-compliance:webhooks_*` | Push ingestion, org-wide webhooks |

On developer.webex.com → your integration → Scopes: check **only** what you configure in `.env`.
