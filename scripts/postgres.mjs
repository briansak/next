#!/usr/bin/env node
/**
 * Unified Postgres lifecycle for Next.
 *
 * Default: Colima/Docker via docker-compose.yml on localhost:5432.
 * Advanced: NEXT_POSTGRES_BACKEND=native for Homebrew pg_ctl (.local/pgdata).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DOCKER_DATABASE_URL,
  getDefaultDatabaseUrl,
  getPostgresBackendPreference,
  NATIVE_DATABASE_URL,
  resolvePostgresBackend,
} from "./postgres-config.mjs";
import { ensureColima } from "./ensure-colima.mjs";
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
  removeNativePostgresData,
  stopNativePostgres,
} from "./postgres-native.mjs";

export {
  DOCKER_DATABASE_URL,
  getDefaultDatabaseUrl,
  getPostgresBackendPreference,
  resolvePostgresBackend,
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.yml");

export function usesColimaBackend() {
  return isDockerPostgresManaged() && resolvePostgresBackend() === "docker";
}

export async function assertPostgresPrerequisites() {
  if (!isDockerPostgresManaged()) return;

  if (resolvePostgresBackend() === "native") {
    assertNativePostgresReady();
    return;
  }

  await ensureColima();
  assertDockerReady();
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

  if (backend === "native") {
    process.env.DATABASE_URL = NATIVE_DATABASE_URL;
    const result = await ensureNativePostgres();
    return { startedByUs: result.startedByUs, backend: "native" };
  }

  await ensureColima();
  process.env.DATABASE_URL = DOCKER_DATABASE_URL;
  const result = await ensureDockerPostgres();
  return { startedByUs: result.startedByUs, backend: "docker" };
}

export async function stopManagedPostgres() {
  if (!isDockerPostgresManaged()) return;

  if (resolvePostgresBackend() === "native") {
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
      await assertPostgresPrerequisites();
      console.log(`Postgres backend: ${resolvePostgresBackend()}`);
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
