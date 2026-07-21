import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  registerWebexWebhooks,
  syncWebexMessages,
} from "@/lib/integrations/webex/ingest";
import { syncWebexMeetings } from "@/lib/integrations/webex/meetings-ingest";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
      } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action ?? "sync";

  try {
    if (action === "register-webhooks") {
      const webhookIds = await registerWebexWebhooks();
      return NextResponse.json({ ok: true, webhookIds });
    }

    const messages = await syncWebexMessages();
    const meetings = await syncWebexMeetings();

    return NextResponse.json({ ok: true, ...messages, meetings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
