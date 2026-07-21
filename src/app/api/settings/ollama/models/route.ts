import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getAppConfig } from "@/lib/config/app-config-store";
import { listOllamaModels } from "@/lib/config/app-config";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getAppConfig(session.userId);
  const models = config.ollamaBaseUrl
    ? await listOllamaModels(config.ollamaBaseUrl)
    : [];

  return NextResponse.json({ models });
}
