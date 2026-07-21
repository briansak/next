import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const LOCAL_USER_EMAIL = "local@next.local";

export const getLocalUser = cache(async () => {
  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      partnerName: true,
      onboardingComplete: true,
      appConfig: true,
      allowOllamaSummaries: true,
    },
  });
});

export async function getLocalUserId(): Promise<string | null> {
  const user = await getLocalUser();
  return user?.id ?? null;
}

export async function requireOnboardingComplete(): Promise<void> {
  const user = await getLocalUser();
  if (!user?.onboardingComplete) {
    redirect("/setup");
  }
}

export async function redirectIfOnboardingComplete(): Promise<void> {
  const user = await getLocalUser();
  if (user?.onboardingComplete) {
    redirect("/dashboard");
  }
}
