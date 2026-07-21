import { cache } from "react";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "next_session";

export interface AuthSession {
  userId: string;
  email: string;
  name: string | null;
  partnerName: string | null;
}

/** Returns the local user after first-launch setup is complete. */
export const getAuthSession = cache(async (): Promise<AuthSession | null> => {
  const user = await prisma.user.findFirst({
    where: { onboardingComplete: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      partnerName: true,
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    partnerName: user.partnerName,
  };
});
