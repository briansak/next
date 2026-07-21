import { Prisma } from "@prisma/client";

export const SCHEMA_MIGRATION_HINT =
  "Run `npm run db:reset` to apply the single-user schema (wipes local DB and re-seeds from .env).";

let schemaMismatchCached = false;

export function isSchemaMismatchCached(): boolean {
  return schemaMismatchCached;
}

export function isPrismaSchemaMismatch(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022"
  );
}

/** Log once and skip further Prisma queries that need the new schema. */
export function markSchemaMismatch(context: string, error?: unknown): void {
  if (schemaMismatchCached) return;
  if (error !== undefined && !isPrismaSchemaMismatch(error)) return;

  schemaMismatchCached = true;
  console.warn(
    `[${context}] Database schema is out of date. ${SCHEMA_MIGRATION_HINT}`
  );
}

/** @deprecated use markSchemaMismatch */
export function logSchemaMismatch(context: string, error: unknown): void {
  markSchemaMismatch(context, error);
}

export function handleSchemaMismatch<T>(
  context: string,
  error: unknown,
  fallback: T
): T {
  if (!isPrismaSchemaMismatch(error)) {
    throw error;
  }

  markSchemaMismatch(context, error);
  return fallback;
}
