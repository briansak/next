import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  envAppConfigDefaults,
  parseStoredAppConfig,
  patchAppConfigSchema,
} from "@/lib/config/app-config";
import {
  getAppConfig,
  updateAppConfig,
} from "@/lib/config/app-config-store";
import { restartIngestionPoller } from "@/lib/ingestion/poll";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { appConfig: true },
  });

  const config = await getAppConfig(session.userId);

  return NextResponse.json({
    config,
    stored: parseStoredAppConfig(user?.appConfig),
    envDefaults: envAppConfigDefaults(),
  });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchAppConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const config = await updateAppConfig(session.userId, parsed.data);
    await restartIngestionPoller();
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save configuration" },
      { status: 500 }
    );
  }
}
