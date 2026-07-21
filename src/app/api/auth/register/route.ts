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

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return NextResponse.json(
      { error: "This install already has an account. Sign in instead." },
      { status: 403 }
    );
  }

  const passwordHash = await hashPassword(password);
  const partnerName = process.env.SEED_PARTNER_NAME?.trim() || null;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name ?? null,
        passwordHash,
        partnerName,
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
