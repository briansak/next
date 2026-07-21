#!/usr/bin/env node
/**
 * Project-local PostgreSQL in .local/pgdata (no Docker).
 * Uses Homebrew/system Postgres binaries — free for all organization sizes.
 */
import { accessSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIR = path.join(ROOT, ".local");
const PGDATA = path.join(LOCAL_DIR, "pgdata");
const PGLOG = path.join(LOCAL_DIR, "postgres.log");
export const NATIVE_PG_PORT = 5433;
export const NATIVE_DATABASE_URL = `postgresql://postgres@127.0.0.1:${NATIVE_PG_PORT}/next?schema=public`;

const BIN_CANDIDATES = [
  process.env.PG_BIN_DIR,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@17/bin",
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveBin(name) {
  const fromPath = spawnSync("command", ["-v", name], {
    encoding: "utf8",
    shell: true,
  });
  if (fromPath.status === 0 && fromPath.stdout?.trim()) {
    return fromPath.stdout.trim();
  }

  for (const dir of BIN_CANDIDATES) {
    const candidate = path.join(dir, name);
    if (spawnSync("test", ["-x", candidate], { shell: true }).status === 0) {
      return candidate;
    }
  }

  return null;
}

export function getNativePostgresBins() {
  const initdb = resolveBin("initdb");
  const pgCtl = resolveBin("pg_ctl");
  const createdb = resolveBin("createdb");
  const psql = resolveBin("psql");
  if (!initdb || !pgCtl || !createdb || !psql) return null;
  return { initdb, pgCtl, createdb, psql };
}

export function hasNativePostgresBinaries() {
  return getNativePostgresBins() !== null;
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  return result;
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

async function waitForPort(port, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if (await checkTcp("127.0.0.1", port)) return true;
    await sleep(500);
  }
  return false;
}

function isNativePostgresRunning() {
  const bins = getNativePostgresBins();
  if (!bins) return false;
  try {
    accessSync(PGDATA);
  } catch {
    return false;
  }
  return run(bins.pgCtl, ["-D", PGDATA, "status"], { stdio: "ignore" }).status === 0;
}

async function initDataDirectory() {
  if (await fileExists(PGDATA)) return;

  const bins = getNativePostgresBins();
  if (!bins) throw new Error("Postgres binaries not found.");

  await mkdir(LOCAL_DIR, { recursive: true, mode: 0o700 });

  const init = run(bins.initdb, [
    "-D",
    PGDATA,
    "-U",
    "postgres",
    "--auth-local=trust",
    "--auth-host=trust",
  ]);
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || "initdb failed");
  }
}

async function ensureDatabase() {
  const bins = getNativePostgresBins();
  if (!bins) return;

  const adminUrl = `postgresql://postgres@127.0.0.1:${NATIVE_PG_PORT}/postgres`;
  const list = run(bins.psql, [
    adminUrl,
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname = 'next'",
  ]);
  if (list.stdout?.trim() === "1") return;

  const create = run(bins.createdb, ["-p", String(NATIVE_PG_PORT), "-U", "postgres", "next"]);
  if (create.status !== 0) {
    throw new Error(create.stderr || create.stdout || "createdb next failed");
  }
}

export function assertNativePostgresReady() {
  if (!hasNativePostgresBinaries()) {
    throw new Error(
      [
        "PostgreSQL binaries not found.",
        "",
        "Install Postgres via Homebrew (free — no Docker license):",
        "  brew install postgresql@16",
        "  brew link postgresql@16 --force",
        "",
        "Or use a free container runtime with the existing docker-compose setup:",
        "  brew install colima docker docker-compose",
        "  colima start",
      ].join("\n")
    );
  }
}

/**
 * @returns {{ startedByUs: boolean }}
 */
export async function ensureNativePostgres() {
  assertNativePostgresReady();
  await initDataDirectory();

  let startedByUs = false;
  if (!(await checkTcp("127.0.0.1", NATIVE_PG_PORT))) {
    const bins = getNativePostgresBins();
    if (!bins) throw new Error("Postgres binaries not found.");

    console.log(`Starting local Postgres (.local/pgdata, port ${NATIVE_PG_PORT})…`);
    const start = run(bins.pgCtl, [
      "-D",
      PGDATA,
      "-l",
      PGLOG,
      "-o",
      `-p ${NATIVE_PG_PORT}`,
      "start",
    ]);
    if (start.status !== 0) {
      throw new Error(start.stderr || start.stdout || "pg_ctl start failed");
    }
    startedByUs = true;
  }

  if (!(await waitForPort(NATIVE_PG_PORT))) {
    throw new Error(`Timed out waiting for Postgres on 127.0.0.1:${NATIVE_PG_PORT}.`);
  }

  await ensureDatabase();
  if (startedByUs) console.log("Postgres is ready.\n");
  return { startedByUs };
}

export async function stopNativePostgres() {
  if (!isNativePostgresRunning()) return;
  const bins = getNativePostgresBins();
  if (!bins) return;

  console.log("\nStopping local Postgres…");
  run(bins.pgCtl, ["-D", PGDATA, "stop", "fast"], { stdio: "inherit" });
}

export async function removeNativePostgresData() {
  await stopNativePostgres().catch(() => {});
  await rm(PGDATA, { recursive: true, force: true });
}
