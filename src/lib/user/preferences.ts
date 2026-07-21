import { prisma } from "@/lib/db";
import {
  ollamaAvailableFromConfig,
  ollamaRuntimeFromConfig,
} from "@/lib/config/app-config";
import { getAppConfig } from "@/lib/config/app-config-store";
import { parseDashboardHiddenCommunicationIds } from "@/lib/communications/viewer-override";

export interface UserPreferences {
  allowOllamaSummaries: boolean;
  ollamaAvailable: boolean;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [user, appConfig] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { allowOllamaSummaries: true },
    }),
    getAppConfig(userId),
  ]);

  return {
    allowOllamaSummaries: user?.allowOllamaSummaries ?? false,
    ollamaAvailable: ollamaAvailableFromConfig(appConfig),
  };
}

export async function getUserOllamaRuntime(userId: string) {
  const appConfig = await getAppConfig(userId);
  return ollamaRuntimeFromConfig(appConfig);
}

export async function loadDashboardHiddenCommunicationIds(
  userId: string
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardHiddenCommunicationIds: true },
  });

  return parseDashboardHiddenCommunicationIds(user?.dashboardHiddenCommunicationIds);
}

export function resolveAllowOllamaForUi(preferences: UserPreferences): boolean {
  return preferences.allowOllamaSummaries && preferences.ollamaAvailable;
}
