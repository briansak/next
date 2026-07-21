#!/usr/bin/env node
/**
 * Start/stop the local Docker Postgres used by Next (docker-compose.yml).
 * Data persists in the named volume between runs; the container stops when the app exits.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureEnvFile } from "./ensure-env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.yml");
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/next?schema=public";

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

function hasDocker() {
  const result = spawnSync("docker", ["info"], {
    stdio: "ignore",
    env: process.env,
  });
  return result.status === 0;
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
  if (process.env.NEXT_MANAGE_POSTGRES === "false") {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    if (!(await isPostgresReachable(databaseUrl))) {
      throw new Error(
        "Postgres is not reachable. Start your database or remove NEXT_MANAGE_POSTGRES=false."
      );
    }
    return { startedByUs: false, managedDocker: false };
  }

  await ensureEnvFile();
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const managedDocker = isManagedLocalPostgres(databaseUrl);

  if (await isPostgresReachable(databaseUrl)) {
    return { startedByUs: false, managedDocker };
  }

  if (!managedDocker) {
    throw new Error(
      `Postgres is not reachable at ${databaseUrl}. Start your database server and try again.`
    );
  }

  if (!hasDocker()) {
    throw new Error(
      "Postgres is not running and Docker was not found. Install Docker or start Postgres manually."
    );
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
  if (command === "ensure") {
    await ensurePostgres();
  } else if (command === "stop") {
    await stopManagedPostgres();
  } else {
    console.error("Usage: node scripts/postgres-docker.mjs <ensure|stop>");
    process.exit(1);
  }
}
