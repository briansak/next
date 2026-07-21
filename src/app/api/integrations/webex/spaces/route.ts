import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getWebexAccessToken } from "@/lib/integrations/webex/ingest";
import { listSpaces } from "@/lib/integrations/webex";
import { filterSpacesByQuery } from "@/lib/integrations/webex/space-display";
import {
  getCachedWebexSpaces,
  setCachedWebexSpaces,
} from "@/lib/integrations/webex/spaces-cache";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
      } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessToken = await getWebexAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Webex not connected" }, { status: 400 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  try {
    let catalog = getCachedWebexSpaces();

    if (!catalog) {
      catalog = await listSpaces(accessToken);
      setCachedWebexSpaces(catalog);
    }

    const spaces = query
      ? filterSpacesByQuery(catalog.spaces, query)
      : catalog.spaces;

    return NextResponse.json({
      spaces,
      totalFetched: catalog.totalFetched,
      truncated: catalog.truncated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list spaces";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
