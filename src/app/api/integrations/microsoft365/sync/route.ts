import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/tenant";
import {
  syncEmailMessages,
  testMicrosoft365Connection,
} from "@/lib/integrations/email/ingest";

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action ?? "sync";

  try {
    if (action === "test") {
      const result = await testMicrosoft365Connection(session.tenantId);
      return NextResponse.json({ ...result });
    }

    const email = await syncEmailMessages(session.tenantId);
    return NextResponse.json({ ok: !email.error, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
