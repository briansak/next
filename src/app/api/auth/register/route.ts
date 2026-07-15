import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createSession,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid registration details" },
      { status: 400 }
    );
  }

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Invalid registration details" },
      { status: 400 }
    );
  }

  let wwtTenant;
  try {
    wwtTenant = await prisma.tenant.findUnique({ where: { slug: "wwt" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Can't reach database server")) {
      return NextResponse.json(
        { error: "Database is not running. Start PostgreSQL and run npm run db:push." },
        { status: 503 }
      );
    }
    throw err;
  }
  if (!wwtTenant) {
    return NextResponse.json(
      { error: "Tenant not configured. Run npm run db:seed first." },
      { status: 503 }
    );
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name ?? null,
        passwordHash,
        memberships: {
          create: {
            tenantId: wwtTenant.id,
            role: "MEMBER",
          },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("Can't reach database server")) {
      return NextResponse.json(
        { error: "Database is not running. Start PostgreSQL and run npm run db:push." },
        { status: 503 }
      );
    }
    console.error("Registration error:", err);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }

  const token = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions(token, 7 * 24 * 60 * 60));

  return response;
}
