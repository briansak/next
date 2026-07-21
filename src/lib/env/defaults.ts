/** Matches docker-compose.yml defaults — local Postgres for a fresh install. */
export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/next?schema=public";

export function applyDefaultDatabaseUrl(): string {
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
  return process.env.DATABASE_URL;
}
