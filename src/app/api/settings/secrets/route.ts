import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { getSecretStatus, updateSecrets } from "@/lib/secrets/store";

const patchSecretsSchema = z
  .object({
    ingestionPollSecret: z.string().trim().max(512).nullable().optional(),
  })
  .strict();

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getSecretStatus();
  return NextResponse.json({
    ingestionPollSecretConfigured: status.ingestionPollSecretConfigured,
  });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSecretsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const status = await updateSecrets({
      ingestionPollSecret: parsed.data.ingestionPollSecret,
    });
    return NextResponse.json({
      ok: true,
      ingestionPollSecretConfigured: status.ingestionPollSecretConfigured,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save secret" },
      { status: 500 }
    );
  }
}
