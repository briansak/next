/**
 * Vidcast MCP client — https://developer.webex.com/mcp/docs/vidcast-mcp-server
 * Requires spark:mcp + Identity scopes on the Webex OAuth grant.
 *
 * Public:  https://mcp.webexapis.com/mcp/vidcast
 * Internal (VPN): https://aicoding-mcp-webexapis.cisco.com/mcp/
 *   Marketplace card: https://mcp-webex.cisco.com/?mode=card&mcpServerName=webexapis
 *
 * Override with WEBEX_MCP_URL (full path) or WEBEX_MCP_BASE_URL (+ optional WEBEX_MCP_PATH).
 */

const PUBLIC_VIDCAST_MCP_URL = "https://mcp.webexapis.com/mcp/vidcast";

export async function getVidcastMcpUrl(): Promise<string> {
  const { getWebexMcpUrl } = await import("./config-store");
  const configured = await getWebexMcpUrl();
  if (configured) return configured;

  const explicit = process.env.WEBEX_MCP_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.WEBEX_MCP_BASE_URL?.trim().replace(/\/$/, "");
  if (base) {
    const path = process.env.WEBEX_MCP_PATH?.trim() || "/mcp/vidcast";
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  return PUBLIC_VIDCAST_MCP_URL;
}

/** @deprecated Use getVidcastMcpUrl() async for runtime resolution. */
export function getVidcastMcpUrlFromEnv(): string {
  const explicit = process.env.WEBEX_MCP_URL?.trim();
  if (explicit) return explicit;
  return PUBLIC_VIDCAST_MCP_URL;
}

export interface VidcastMcpError {
  code?: number;
  message?: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: VidcastMcpError;
}

function parseMcpResponseBody(
  text: string,
  contentType: string | null
): JsonRpcResponse {
  const trimmed = text.trim();
  if (!trimmed) return {};

  if (
    contentType?.includes("text/event-stream") ||
    trimmed.startsWith("event:")
  ) {
    const dataLines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(dataLines[i]!) as JsonRpcResponse;
      } catch {
        // try earlier event
      }
    }
    return { error: { message: trimmed.slice(0, 500) } };
  }

  try {
    return JSON.parse(trimmed) as JsonRpcResponse;
  } catch {
    return { error: { message: trimmed.slice(0, 500) } };
  }
}

export class VidcastMcpClient {
  private sessionId: string | null = null;
  private readonly mcpUrl: string;

  constructor(
    private readonly accessToken: string,
    options?: { mcpUrl?: string }
  ) {
    this.mcpUrl = options?.mcpUrl ?? PUBLIC_VIDCAST_MCP_URL;
  }

  static async create(accessToken: string): Promise<VidcastMcpClient> {
    const mcpUrl = await getVidcastMcpUrl();
    return new VidcastMcpClient(accessToken, { mcpUrl });
  }

  async initialize(): Promise<void> {
    const { status, headers, data } = await this.post({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "next", version: "1.0.0" },
      },
      id: 1,
    });

    if (status === 401 || data.error) {
      throw new Error(
        data.error?.message ??
          `Vidcast MCP initialize failed (${status})`
      );
    }

    this.sessionId = headers.get("mcp-session-id");
    // Internal Cisco gateway may omit session id; continue when initialize succeeded.
    if (!this.sessionId && !data.result) {
      throw new Error("Vidcast MCP did not return a session id");
    }

    await this.post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
  }

  async listTools(): Promise<string[]> {
    const data = await this.callMethod("tools/list", 2);
    const tools = (data as { tools?: Array<{ name?: string }> })?.tools ?? [];
    return tools.map((tool) => tool.name ?? "").filter(Boolean);
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const data = await this.callMethod("tools/call", Date.now(), {
      name,
      arguments: args,
    });

    const result = data as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };

    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text) {
      return data as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async searchVideos(query: string, limit = 5): Promise<unknown> {
    return this.callTool("vidcast-search-videos", { query, limit });
  }

  async getVideoHighlights(videoId: string): Promise<unknown> {
    return this.callTool("vidcast-get-video-highlights", { videoId });
  }

  async getVideoTranscript(videoId: string): Promise<unknown> {
    return this.callTool("vidcast-get-video-transcript", { videoId });
  }

  private async callMethod(
    method: string,
    id: number,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.sessionId) {
      await this.initialize();
    }

    const { data } = await this.post({
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
      id,
    });

    if (data.error) {
      throw new Error(data.error.message ?? `Vidcast MCP ${method} failed`);
    }

    return data.result;
  }

  private async post(body: Record<string, unknown>): Promise<{
    status: number;
    headers: Headers;
    data: JsonRpcResponse;
  }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = parseMcpResponseBody(text, response.headers.get("content-type"));

    return { status: response.status, headers: response.headers, data };
  }
}

export { parseVidcastShareId } from "./vidcast-api";
