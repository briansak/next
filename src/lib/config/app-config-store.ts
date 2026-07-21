import { prisma } from "@/lib/db";
import {
  normalizeOllamaBaseUrl,
  parseStoredAppConfig,
  resolveAppConfig,
  type PatchAppConfigInput,
  type ResolvedAppConfig,
  type StoredAppConfig,
} from "./app-config";

export async function getAppConfig(userId: string): Promise<ResolvedAppConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appConfig: true },
  });
  return resolveAppConfig(user?.appConfig);
}

export async function updateAppConfig(
  userId: string,
  patch: PatchAppConfigInput
): Promise<ResolvedAppConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, appConfig: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const current = parseStoredAppConfig(user.appConfig);
  const nextStored: StoredAppConfig = {
    ...current,
    ...patch,
  };

  if (patch.ollamaBaseUrl !== undefined) {
    nextStored.ollamaBaseUrl = normalizeOllamaBaseUrl(patch.ollamaBaseUrl);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { appConfig: nextStored },
    select: { appConfig: true },
  });

  return resolveAppConfig(updated.appConfig);
}
