import { prisma } from "@/lib/db";
import type { MentionUser } from "@/lib/heuristics/mentions";

export async function getCurrentUserForMentions(
  userId: string
): Promise<MentionUser[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) return [];

  return [{ id: user.id, name: user.name, email: user.email }];
}

/** First user in the app — for background jobs without a session. */
export async function getAppUserForMentions(): Promise<MentionUser[]> {
  const user = await prisma.user.findFirst({
    select: { id: true, name: true, email: true },
  });

  if (!user) return [];

  return [{ id: user.id, name: user.name, email: user.email }];
}

export async function getFirstUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}
