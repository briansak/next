import { prisma } from "../src/lib/db";
import { getWebexAccessToken } from "../src/lib/integrations/webex/ingest";
import { getWebexScopes } from "../src/lib/integrations/webex";
import { VidcastMcpClient, getVidcastMcpUrl } from "../src/lib/integrations/webex/vidcast-mcp";

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log("No tenant found");
    return;
  }

  const token = await getWebexAccessToken(tenant.id);
  if (!token) {
    console.log("No Webex token — reconnect Webex in Settings");
    return;
  }

  const scopes = getWebexScopes();
  console.log("Configured scopes:", scopes);
  console.log("Has spark:mcp:", scopes.includes("spark:mcp"));

  const stored = await prisma.integrationToken.findFirst({
    where: { tenantId: tenant.id, provider: "WEBEX" },
    select: { expiresAt: true, updatedAt: true },
  });
  console.log("Token last updated:", stored?.updatedAt?.toISOString() ?? "unknown");
  if (!scopes.includes("spark:mcp")) {
    console.log("\nSet WEBEX_SCOPE_MODE=standard+meetings+vidcast and reconnect Webex.");
    await prisma.$disconnect();
    return;
  }

  console.log("MCP endpoint:", getVidcastMcpUrl());

  try {
    const client = new VidcastMcpClient(token);
    await client.initialize();
    console.log("\nMCP session established.");

    const tools = await client.listTools();
    console.log("Tools available:", tools.length);
    console.log("Sample tools:", tools.slice(0, 5).join(", "));

    const vidcastTools = tools.filter((name) => name.startsWith("vidcast-"));
    if (vidcastTools.length === 0) {
      console.log(
        "\nNo vidcast-* tools on this server.",
        "Internal Webex APIs MCP (aicoding-mcp-webexapis.cisco.com) exposes messaging/meetings only.",
        "Vidcast highlights require the public server: https://mcp.webexapis.com/mcp/vidcast",
        "(Control Hub must enable Vidcast MCP for your org)."
      );
      await prisma.$disconnect();
      return;
    }

    const results = await client.searchVideos("AI Townhall", 3);
    console.log("\nSearch 'AI Townhall':", JSON.stringify(results, null, 2).slice(0, 2000));

    const items =
      results && typeof results === "object" && "items" in results
        ? (results as { items?: Array<{ id?: string; title?: string }> }).items
        : undefined;
    const first = items?.[0];
    if (first?.id) {
      const highlights = await client.getVideoHighlights(first.id);
      console.log(
        `\nHighlights for ${first.title ?? first.id}:`,
        JSON.stringify(highlights, null, 2).slice(0, 2000)
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("\nVidcast MCP failed:", message);
    if (message.includes("don't have access to this MCP server")) {
      console.log(
        "\nVidcast MCP is not enabled for your org yet.",
        "Ask your Webex administrator to enable the Vidcast MCP server in Control Hub.",
        "See docs/WEBEX_INGESTION.md → Vidcast MCP."
      );
    } else if (message.includes("spark:mcp")) {
      console.log(
        "\nThe stored token was issued before MCP scopes were added.",
        "Go to Settings → Ingestion → Reconnect Webex to refresh the token."
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
