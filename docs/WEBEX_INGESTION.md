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
- Per-install OAuth token storage and allowlist enforcement
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
                              Communication (local DB)
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

See **[WEBEX_GETTING_STARTED.md](./WEBEX_GETTING_STARTED.md)** for step-by-step OAuth integration setup and keeping refresh tokens alive past the short access-token window.

1. Create Webex integration at [developer.webex.com](https://developer.webex.com)
2. **Check scopes on the integration** — must match **Settings → Webex** scope preset exactly (see Scope modes below)
3. Redirect URI: `http://localhost:3000/api/integrations/webex/callback` (save the same value in Settings → Webex)
4. Add space IDs to ingestion policy (DRAFT → ACTIVE)
5. Save OAuth credentials and **Connect Webex** in **Settings → Webex**
6. Register webhooks (requires public app URL in Settings → Webex — use ngrok for local dev)
7. Trigger manual sync: **Settings → Webex → Sync**

## Scope modes

Webex returns `invalid_scope` if the app requests scopes not **checked** on your integration.

Set scope preset in **Settings → Webex** (or custom scopes in the same panel):

| Mode | Scopes | When to use |
|------|--------|-------------|
| `standard` (default) | `spark:messages_read` `spark:rooms_read` | Authenticating user is a **member** of the allowlisted spaces |
| `compliance` | `spark-compliance:messages_read` `spark-compliance:rooms_read` | **Org-wide** read; user has compliance/admin role |
| `standard+webhooks` | standard + `spark:webhooks_*` | Push ingestion, user-level webhooks |
| `compliance+webhooks` | compliance + `spark-compliance:webhooks_*` | Push ingestion, org-wide webhooks |
| `standard+meetings+vidcast` | meetings + `spark:mcp` `Identity:Organization` `Identity:Config` | Vidcast MCP (AI highlights, transcripts) |

On developer.webex.com → your integration → Scopes: check **only** what you configure in Settings → Webex.

## Vidcast MCP (Internal Calls — future)

Town halls and enablement sessions hosted on **Vidcast** (`app.vidcast.io`) expose AI summaries and short highlight reels (e.g. 2m31s of a 45m recording). Programmatic access is via the **Vidcast MCP server**, not the Meetings REST API.

| Requirement | Who | Notes |
|-------------|-----|-------|
| OAuth scopes on integration | You | `spark:mcp`, `Identity:Organization`, `Identity:Config` — use scope preset `standard+meetings+vidcast` in Settings → Webex |
| Reconnect Webex after scope change | You | Settings → Webex → Reconnect Webex |
| **Vidcast MCP enabled in Control Hub** | **Org admin** | Without this, MCP returns: *"You don't have access to this MCP server yet. Ask your administrator to enable it for your account or organization."* |

**Public server:** `https://mcp.webexapis.com/mcp/vidcast`  
**Docs:** [Vidcast MCP Server](https://developer.webex.com/mcp/docs/vidcast-mcp-server)

### Cisco internal gateway (VPN)

The [Internal MCP Marketplace](https://mcp-webex.cisco.com/?mode=card&mcpServerName=webexapis) is a **UI for connecting Cursor** — it does not proxy MCP traffic.

| Server | URL | Tools |
|--------|-----|-------|
| **Webex APIs** (internal) | `https://aicoding-mcp-webexapis.cisco.com/mcp/` | Spaces, messages, meetings (24 tools) — **not** Vidcast highlights |
| **Vidcast** (public) | `https://mcp.webexapis.com/mcp/vidcast` | `vidcast-search-videos`, `vidcast-get-video-highlights`, etc. — requires Control Hub |

The marketplace “Vidcast” button on the Webex APIs card is a **demo playlist**, not a separate Vidcast MCP server. There is no internal `mcp/vidcast` endpoint in the marketplace catalog.

Internal Webex APIs MCP (VPN):

```bash
WEBEX_MCP_URL=https://aicoding-mcp-webexapis.cisco.com/mcp/ npx tsx scripts/probe-vidcast-mcp.ts
```

Public Vidcast MCP (Control Hub must enable Vidcast MCP for your org):

```bash
npx tsx scripts/probe-vidcast-mcp.ts
```

**Until public Vidcast MCP is enabled**, Meeting Summaries still work via replay notification emails. For **Vidcast** replay links (`app.vidcast.io/share/...`), the app can also pull AI chapters and highlights directly from `https://api.vidcast.io` using your existing Webex OAuth token — no MCP required.

Direct API (used by replay enrichment):

| Endpoint | Returns |
|----------|---------|
| `GET /v1/share/{shareId}/chapters` | AI chapter summary (timestamped outline) |
| `GET /v1/share/{shareId}/highlights` | AI highlight reel items (timestamps + labels) |
| `GET /v3/transcripts/{shareId}` | Full transcript (summarized locally via Ollama when `OLLAMA_BASE_URL` is set) |
| `POST /v1/access/shared/{shareId}` | Resolves internal `videoId` |

Replay emails often mask Vidcast behind `app.campaignmgr.cisco.com` / Eloqua bridge links. During enrichment the app follows those redirects (typically 2 hops) to resolve the real `app.vidcast.io/share/{uuid}` before calling the API above.

Probe a share link:

```bash
npx tsx scripts/probe-vidcast-api.ts "https://app.vidcast.io/share/<share-id>"
```

**Until public Vidcast MCP is enabled**, highlight reel ingestion via MCP still requires `mcp.webexapis.com/mcp/vidcast` Control Hub access.
