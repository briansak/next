#!/usr/bin/env node
/**
 * Unified Postgres lifecycle for Next.
 *
 * Backends (NEXT_POSTGRES_BACKEND):
 *   auto   — Docker/Colima if available, else project-local Postgres in .local/pgdata (default)
 *   docker — docker-compose.yml on localhost:5432
 *   native — .local/pgdata via pg_ctl on localhost:5433 (no Docker license)
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureEnvFile } from "./ensure-env.mjs";
import {
  assertDockerReady,
  ensurePostgres as ensureDockerPostgres,
  hasDocker,
  isDockerPostgresManaged,
  stopManagedPostgres as stopDockerPostgres,
} from "./postgres-docker.mjs";
import {
  assertNativePostgresReady,
  ensureNativePostgres,
  hasNativePostgresBinaries,
  NATIVE_DATABASE_URL,
  removeNativePostgresData,
  stopNativePostgres,
} from "./postgres-native.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.yml");
export const DOCKER_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/next?schema=public";

export function getPostgresBackendPreference() {
  const value = (process.env.NEXT_POSTGRES_BACKEND ?? "auto").trim().toLowerCase();
  if (value === "docker" || value === "native" || value === "auto") return value;
  return "auto";
}

export function resolvePostgresBackend() {
  const preference = getPostgresBackendPreference();
  if (preference === "docker") return "docker";
  if (preference === "native") return "native";
  if (hasDocker()) return "docker";
  if (hasNativePostgresBinaries()) return "native";
  return null;
}

export function getDefaultDatabaseUrl(backend = resolvePostgresBackend()) {
  if (backend === "native") return NATIVE_DATABASE_URL;
  return DOCKER_DATABASE_URL;
}

export function assertPostgresPrerequisites() {
  if (!isDockerPostgresManaged()) return;

  const preference = getPostgresBackendPreference();
  if (preference === "docker") {
    assertDockerReady();
    return;
  }
  if (preference === "native") {
    assertNativePostgresReady();
    return;
  }

  const backend = resolvePostgresBackend();
  if (backend === "docker") {
    assertDockerReady();
    return;
  }
  if (backend === "native") {
    assertNativePostgresReady();
    return;
  }

  throw new Error(
    [
      "No Postgres runtime found.",
      "",
      "Option A — free container runtime (same docker-compose.yml, no Docker Desktop license):",
      "  brew install colima docker docker-compose",
      "  colima start",
      "",
      "Option B — local Postgres binaries (no containers):",
      "  brew install postgresql@16",
      "  brew link postgresql@16 --force",
      "",
      "Then run: npm run setup",
    ].join("\n")
  );
}

/**
 * @returns {{ startedByUs: boolean, backend: "docker" | "native" | "external" }}
 */
export async function ensurePostgres() {
  if (!isDockerPostgresManaged()) {
    await ensureEnvFile();
    return { startedByUs: false, backend: "external" };
  }

  await ensureEnvFile();
  const backend = resolvePostgresBackend();
  if (!backend) {
    assertPostgresPrerequisites();
  }

  if (backend === "native") {
    process.env.DATABASE_URL = NATIVE_DATABASE_URL;
    const result = await ensureNativePostgres();
    return { startedByUs: result.startedByUs, backend: "native" };
  }

  process.env.DATABASE_URL = DOCKER_DATABASE_URL;
  const result = await ensureDockerPostgres();
  return { startedByUs: result.startedByUs, backend: "docker" };
}

export async function stopManagedPostgres() {
  if (!isDockerPostgresManaged()) return;

  const backend = resolvePostgresBackend();
  if (backend === "native") {
    await stopNativePostgres();
    return;
  }
  await stopDockerPostgres();
}

export async function removeManagedPostgresData() {
  if (!isDockerPostgresManaged()) return false;

  let removed = false;

  if (hasDocker()) {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (result.status === 0) removed = true;
  }

  const { access } = await import("node:fs/promises");
  const pgdata = path.join(ROOT, ".local", "pgdata");
  try {
    await access(pgdata);
    await removeNativePostgresData();
    removed = true;
  } catch {
    // No native data directory.
  }

  return removed;
}

const command = process.argv[2];

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (command === "check") {
      assertPostgresPrerequisites();
      const backend = resolvePostgresBackend();
      console.log(`Postgres backend: ${backend ?? "external"}`);
    } else if (command === "ensure") {
      await ensurePostgres();
    } else if (command === "stop") {
      await stopManagedPostgres();
    } else {
      console.error("Usage: node scripts/postgres.mjs <check|ensure|stop>");
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
