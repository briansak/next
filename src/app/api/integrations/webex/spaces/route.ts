import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/tenant";
import { getWebexAccessToken } from "@/lib/integrations/webex/ingest";
import { listSpaces } from "@/lib/integrations/webex";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireAdmin({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessToken = await getWebexAccessToken(session.tenantId);
  if (!accessToken) {
    return NextResponse.json({ error: "Webex not connected" }, { status: 400 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;

  try {
    const spaces = await listSpaces(accessToken, { query });
    return NextResponse.json({ spaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list spaces";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
