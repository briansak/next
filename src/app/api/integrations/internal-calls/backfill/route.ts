import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { syncEmailMessages } from "@/lib/integrations/email/ingest";
import { backfillInternalCallReplays } from "@/lib/integrations/internal-calls/replay-ingest";

export async function POST() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backfill = await backfillInternalCallReplays(session.tenantId);
    const email = await syncEmailMessages(session.tenantId).catch((err) => ({
      error: err instanceof Error ? err.message : "Sync failed",
      ingested: 0,
      fetched: 0,
      skipped: 0,
    }));

    return NextResponse.json({
      ok: true,
      backfill,
      email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
