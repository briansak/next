import { prisma } from "@/lib/db";
import {
  handleSchemaMismatch,
  isPrismaSchemaMismatch,
  isSchemaMismatchCached,
  markSchemaMismatch,
  SCHEMA_MIGRATION_HINT,
} from "@/lib/db/schema-mismatch";
import {
  normalizeAppleCalendarNames,
  normalizeOllamaBaseUrl,
  parseStoredAppConfig,
  resolveAppConfig,
  type PatchAppConfigInput,
  type ResolvedAppConfig,
  type StoredAppConfig,
} from "./app-config";
import { getFirstUserId } from "@/lib/user/profile";

export async function getAppConfig(userId: string): Promise<ResolvedAppConfig> {
  if (isSchemaMismatchCached()) {
    return resolveAppConfig(null);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { appConfig: true },
    });
    return resolveAppConfig(user?.appConfig);
  } catch (error) {
    return handleSchemaMismatch("app-config", error, resolveAppConfig(null));
  }
}

export async function updateAppConfig(
  userId: string,
  patch: PatchAppConfigInput
): Promise<ResolvedAppConfig> {
  if (isSchemaMismatchCached()) {
    throw new Error(`Cannot save settings until the database is migrated. ${SCHEMA_MIGRATION_HINT}`);
  }

  try {
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

    if (patch.appleCalendarNames !== undefined) {
      nextStored.appleCalendarNames = normalizeAppleCalendarNames(patch.appleCalendarNames);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { appConfig: nextStored },
      select: { appConfig: true },
    });

    return resolveAppConfig(updated.appConfig);
  } catch (error) {
    if (isPrismaSchemaMismatch(error)) {
      markSchemaMismatch("app-config", error);
      throw new Error(
        `Cannot save settings until the database is migrated. ${SCHEMA_MIGRATION_HINT}`
      );
    }
    throw error;
  }
}

/** Resolved import settings for the local user (background jobs and ingest). */
export async function getImportAppConfig(): Promise<ResolvedAppConfig> {
  const userId = await getFirstUserId();
  if (userId) {
    return getAppConfig(userId);
  }
  return resolveAppConfig(null);
}
