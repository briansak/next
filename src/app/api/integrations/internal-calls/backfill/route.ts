import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { runEmailBackfills } from "@/lib/integrations/email/ingest";

export async function POST() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backfill = await runEmailBackfills();
    return NextResponse.json({
      ok: true,
      backfill,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
