import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getAppConfig } from "@/lib/config/app-config-store";
import { listOllamaModels, normalizeOllamaBaseUrl } from "@/lib/config/app-config";

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queryUrl = new URL(request.url).searchParams.get("baseUrl");
  const config = await getAppConfig(session.userId);
  const baseUrl = normalizeOllamaBaseUrl(queryUrl) ?? config.ollamaBaseUrl;

  if (!baseUrl) {
    return NextResponse.json({ models: [] });
  }

  const models = await listOllamaModels(baseUrl);
  return NextResponse.json({ models, baseUrl });
}
