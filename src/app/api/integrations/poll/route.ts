import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  runIngestionPoll,
} from "@/lib/ingestion/poll";
import { requireAdmin } from "@/lib/tenant";

function authorizedByCronSecret(request: Request): boolean {
  const secret = process.env.INGESTION_POLL_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const cronAuth = authorizedByCronSecret(request);

  if (!cronAuth) {
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
  }

  const result = await runIngestionPoll();
  return NextResponse.json({ ok: true, ...result });
}
