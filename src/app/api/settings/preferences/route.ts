import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getUserPreferences,
  resolveAllowOllamaForUi,
} from "@/lib/user/preferences";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await getUserPreferences(session.userId);

  return NextResponse.json({
    allowOllamaSummaries: preferences.allowOllamaSummaries,
    ollamaAvailable: preferences.ollamaAvailable,
    allowOllamaForUi: resolveAllowOllamaForUi(preferences),
  });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const allowOllamaSummaries = body?.allowOllamaSummaries === true;

  await prisma.user.update({
    where: { id: session.userId },
    data: { allowOllamaSummaries },
  });

  const preferences = await getUserPreferences(session.userId);

  return NextResponse.json({
    ok: true,
    allowOllamaSummaries: preferences.allowOllamaSummaries,
    ollamaAvailable: preferences.ollamaAvailable,
    allowOllamaForUi: resolveAllowOllamaForUi(preferences),
  });
}
