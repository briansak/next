#!/usr/bin/env node
/**
 * Start/stop the local Docker Postgres used by Next (docker-compose.yml).
 * Data persists in the named volume between runs; the container stops when the app exits.
 *
 * Default install requires Docker Desktop — no manual Postgres or .env editing.
 * Set NEXT_MANAGE_POSTGRES=false only for advanced external-database setups.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOCKER_DATABASE_URL } from "./postgres-config.mjs";
import { ensureEnvFile } from "./ensure-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.yml");
const DEFAULT_DATABASE_URL = DOCKER_DATABASE_URL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDatabaseTarget(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname || "localhost",
      port: Number.parseInt(url.port || "5432", 10),
      database: url.pathname.replace(/^\//, "").split("?")[0] || "next",
    };
  } catch {
    return { host: "localhost", port: 5432, database: "next" };
  }
}

function isManagedLocalPostgres(databaseUrl) {
  const target = parseDatabaseTarget(databaseUrl);
  const isLocalHost =
    target.host === "localhost" ||
    target.host === "127.0.0.1" ||
    target.host === "::1";
  return isLocalHost && target.port === 5432;
}

export function isDockerPostgresManaged() {
  return process.env.NEXT_MANAGE_POSTGRES !== "false";
}

function dockerBinaryExists() {
  const result = spawnSync("docker", ["--version"], {
    stdio: "ignore",
    env: process.env,
  });
  return result.status === 0;
}

export function hasDocker() {
  const result = spawnSync("docker", ["info"], {
    stdio: "ignore",
    env: process.env,
  });
  return result.status === 0;
}

function isOurPostgresContainerRunning() {
  if (!hasDocker()) return false;

  const list = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "ps", "-q", "db"],
    { cwd: ROOT, encoding: "utf8", env: process.env }
  );
  const containerId = list.stdout?.trim();
  if (!containerId || list.status !== 0) return false;

  const inspect = spawnSync(
    "docker",
    ["inspect", "-f", "{{.State.Running}}", containerId],
    { encoding: "utf8", env: process.env }
  );
  return inspect.stdout?.trim() === "true";
}

/** Fail fast when Docker is required but missing or not running. */
export function assertDockerReady() {
  if (!isDockerPostgresManaged()) return;

  if (!dockerBinaryExists()) {
    throw new Error(
      [
        "Docker is not available.",
        "",
        "Setup installs Colima automatically when Homebrew is present.",
        "If setup did not finish, run:",
        "  brew install colima docker docker-compose",
        "  colima start",
      ].join("\n")
    );
  }

  if (!hasDocker()) {
    throw new Error(
      [
        "Docker is installed but not running.",
        "",
        "Start Docker Desktop, wait until it is ready, then run setup again.",
      ].join("\n")
    );
  }
}

function portConflictMessage() {
  return [
    "Port 5432 is already in use by another PostgreSQL server (often Homebrew).",
    "",
    "Next expects to manage Postgres via Docker on localhost:5432.",
    "Stop the other server, then run setup again. Example:",
    "  brew services stop postgresql@16",
    "",
    "Verify the port is free:",
    "  lsof -i :5432",
  ].join("\n");
}

function checkTcp(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function runDockerCompose(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose ${args.join(" ")} failed (${code})`));
    });
  });
}

async function isPostgresReachable(databaseUrl) {
  const target = parseDatabaseTarget(databaseUrl);
  return checkTcp(target.host, target.port);
}

async function waitForPostgres(databaseUrl, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if (await isPostgresReachable(databaseUrl)) return true;
    await sleep(500);
  }
  return false;
}

/**
 * Ensure Postgres is reachable. Starts Docker Compose `db` when using local defaults.
 * @returns {{ startedByUs: boolean, managedDocker: boolean }}
 */
export async function ensurePostgres() {
  if (!isDockerPostgresManaged()) {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    if (!(await isPostgresReachable(databaseUrl))) {
      throw new Error(
        "Postgres is not reachable. Start your database or remove NEXT_MANAGE_POSTGRES=false."
      );
    }
    return { startedByUs: false, managedDocker: false };
  }

  assertDockerReady();
  await ensureEnvFile();
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const managedDocker = isManagedLocalPostgres(databaseUrl);

  if (!managedDocker) {
    if (!(await isPostgresReachable(databaseUrl))) {
      throw new Error(
        `Postgres is not reachable at ${databaseUrl}. ` +
          "For external databases, set NEXT_MANAGE_POSTGRES=false and ensure the server is running."
      );
    }
    return { startedByUs: false, managedDocker: false };
  }

  if (await isPostgresReachable(databaseUrl)) {
    if (!isOurPostgresContainerRunning()) {
      throw new Error(portConflictMessage());
    }
    return { startedByUs: false, managedDocker: true };
  }

  console.log("Starting local Postgres (docker compose)…");
  await runDockerCompose(["up", "-d", "db"]);

  if (!(await waitForPostgres(databaseUrl))) {
    throw new Error("Timed out waiting for Postgres to accept connections on localhost:5432.");
  }

  console.log("Postgres is ready.\n");
  return { startedByUs: true, managedDocker: true };
}

/** Stop the Docker Postgres service (data volume is kept). */
export async function stopManagedPostgres() {
  if (!isDockerPostgresManaged()) return;

  await ensureEnvFile();
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (!isManagedLocalPostgres(databaseUrl) || !hasDocker()) return;

  console.log("\nStopping local Postgres…");
  try {
    await runDockerCompose(["stop", "db"]);
  } catch {
    // Best effort on shutdown.
  }
}

const command = process.argv[2];

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (command === "check-docker") {
      assertDockerReady();
    } else if (command === "ensure") {
      await ensurePostgres();
    } else if (command === "stop") {
      await stopManagedPostgres();
    } else {
      console.error("Usage: node scripts/postgres-docker.mjs <check-docker|ensure|stop>");
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
