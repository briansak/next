/** Shared Postgres URLs and backend selection — no imports from ensure-env or postgres.mjs. */
export const DOCKER_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/next?schema=public";

export const NATIVE_PG_PORT = 5433;
export const NATIVE_DATABASE_URL = `postgresql://postgres@127.0.0.1:${NATIVE_PG_PORT}/next?schema=public`;

export function getPostgresBackendPreference() {
  const value = (process.env.NEXT_POSTGRES_BACKEND ?? "docker").trim().toLowerCase();
  if (value === "docker" || value === "native") return value;
  return "docker";
}

export function resolvePostgresBackend() {
  if (getPostgresBackendPreference() === "native") return "native";
  return "docker";
}

export function getDefaultDatabaseUrl(backend = resolvePostgresBackend()) {
  if (backend === "native") return NATIVE_DATABASE_URL;
  return DOCKER_DATABASE_URL;
}
