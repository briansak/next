import { prisma } from "@/lib/db";
import {
  handleSchemaMismatch,
  isPrismaSchemaMismatch,
  isSchemaMismatchCached,
  markSchemaMismatch,
  SCHEMA_MIGRATION_HINT,
} from "@/lib/db/schema-mismatch";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";

export type SecretField =
  | "webexClientId"
  | "webexClientSecret"
  | "webexWebhookSecret"
  | "ingestionPollSecret";

const FIELD_COLUMN: Record<
  SecretField,
  keyof Pick<
    {
      webexClientIdEnc: string | null;
      webexClientSecretEnc: string | null;
      webexWebhookSecretEnc: string | null;
      ingestionPollSecretEnc: string | null;
    },
    "webexClientIdEnc" | "webexClientSecretEnc" | "webexWebhookSecretEnc" | "ingestionPollSecretEnc"
  >
> = {
  webexClientId: "webexClientIdEnc",
  webexClientSecret: "webexClientSecretEnc",
  webexWebhookSecret: "webexWebhookSecretEnc",
  ingestionPollSecret: "ingestionPollSecretEnc",
};

const ENV_FALLBACK: Partial<Record<SecretField, string>> = {
  webexClientId: "WEBEX_CLIENT_ID",
  webexClientSecret: "WEBEX_CLIENT_SECRET",
  webexWebhookSecret: "WEBEX_WEBHOOK_SECRET",
  ingestionPollSecret: "INGESTION_POLL_SECRET",
};

export interface SecretStatus {
  webexClientIdConfigured: boolean;
  webexClientIdHint: string | null;
  webexClientSecretConfigured: boolean;
  webexWebhookSecretConfigured: boolean;
  ingestionPollSecretConfigured: boolean;
}

async function ensureSecretsRow() {
  return prisma.encryptedSecrets.upsert({
    where: { id: "local" },
    create: { id: "local" },
    update: {},
  });
}

export async function getSecret(field: SecretField): Promise<string | null> {
  if (isSchemaMismatchCached()) {
    const envName = ENV_FALLBACK[field];
    return envName ? process.env[envName]?.trim() || null : null;
  }

  try {
    const row = await prisma.encryptedSecrets.findUnique({ where: { id: "local" } });
    const column = FIELD_COLUMN[field];
    const encrypted = row?.[column];
    if (encrypted) {
      return (await decryptSecret(encrypted)) ?? null;
    }
  } catch (error) {
    handleSchemaMismatch("encrypted-secrets", error, null);
  }

  const envName = ENV_FALLBACK[field];
  return envName ? process.env[envName]?.trim() || null : null;
}

export async function getSecretStatus(): Promise<SecretStatus> {
  const clientId = await getSecret("webexClientId");
  const clientSecret = await getSecret("webexClientSecret");
  const webhookSecret = await getSecret("webexWebhookSecret");
  const pollSecret = await getSecret("ingestionPollSecret");

  return {
    webexClientIdConfigured: Boolean(clientId),
    webexClientIdHint: clientId ? maskSecret(clientId) : null,
    webexClientSecretConfigured: Boolean(clientSecret),
    webexWebhookSecretConfigured: Boolean(webhookSecret),
    ingestionPollSecretConfigured: Boolean(pollSecret),
  };
}

export async function updateSecrets(
  patch: Partial<Record<SecretField, string | null>>
): Promise<SecretStatus> {
  if (isSchemaMismatchCached()) {
    throw new Error(`Cannot save secrets until the database is migrated. ${SCHEMA_MIGRATION_HINT}`);
  }

  try {
    await ensureSecretsRow();
    const data: Record<string, string | null> = {};

    for (const [field, value] of Object.entries(patch) as Array<
      [SecretField, string | null | undefined]
    >) {
      if (value === undefined) continue;
      const column = FIELD_COLUMN[field];
      if (value === null || value.trim() === "") {
        data[column] = null;
        continue;
      }
      data[column] = await encryptSecret(value.trim());
    }

    if (Object.keys(data).length > 0) {
      await prisma.encryptedSecrets.update({
        where: { id: "local" },
        data,
      });
    }

    return getSecretStatus();
  } catch (error) {
    if (isPrismaSchemaMismatch(error)) {
      markSchemaMismatch("encrypted-secrets", error);
      throw new Error(
        `Cannot save secrets until the database is migrated. ${SCHEMA_MIGRATION_HINT}`
      );
    }
    throw error;
  }
}

export async function migrateSecretsFromEnv(): Promise<void> {
  if (isSchemaMismatchCached()) return;

  try {
    const row = await ensureSecretsRow();
    const patch: Partial<Record<SecretField, string | null>> = {};

    if (!row.webexClientIdEnc && process.env.WEBEX_CLIENT_ID?.trim()) {
      patch.webexClientId = process.env.WEBEX_CLIENT_ID.trim();
    }
    if (!row.webexClientSecretEnc && process.env.WEBEX_CLIENT_SECRET?.trim()) {
      patch.webexClientSecret = process.env.WEBEX_CLIENT_SECRET.trim();
    }
    if (!row.webexWebhookSecretEnc && process.env.WEBEX_WEBHOOK_SECRET?.trim()) {
      patch.webexWebhookSecret = process.env.WEBEX_WEBHOOK_SECRET.trim();
    }
    if (!row.ingestionPollSecretEnc && process.env.INGESTION_POLL_SECRET?.trim()) {
      patch.ingestionPollSecret = process.env.INGESTION_POLL_SECRET.trim();
    }

    if (Object.keys(patch).length > 0) {
      await updateSecrets(patch);
    }
  } catch {
    // Best-effort migration from legacy .env values.
  }
}
