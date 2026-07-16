import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { MemberRole } from "@prisma/client";
import {
  generateSessionToken,
  hashSessionToken,
} from "./password";

export const SESSION_COOKIE = "next_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthSession {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  partnerName: string | null;
  role: MemberRole;
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  return token;
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export const getAuthSession = cache(async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              tenant: { include: { partner: true } },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    tenantSlug: membership.tenant.slug,
    partnerName: membership.tenant.partner?.name ?? null,
    role: membership.role,
  };
});

export function sessionCookieOptions(token: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
