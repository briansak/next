#!/usr/bin/env node
/**
 * Start the Next.js dev server and open the app in the default browser
 * once the server is ready (Streamlit-style).
 *
 * Set NEXT_OPEN_BROWSER=false to skip auto-open (e.g. CI).
 * Set NEXT_MANAGE_POSTGRES=false to disable Docker Postgres auto start/stop.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureEnvFile } from "./ensure-env.mjs";
import { ensurePostgres, stopManagedPostgres } from "./postgres.mjs";

process.title = "next";

const port = process.env.PORT ?? "3000";
const url = `http://localhost:${port}`;
const shouldOpen = process.env.NEXT_OPEN_BROWSER !== "false";

const nextBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

let opened = false;
let shuttingDown = false;
let postgresStartedByUs = false;

function openBrowser() {
  if (!shouldOpen || opened) return;
  opened = true;

  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }

  console.log(`\n  → Opened ${url} in your browser\n`);
}

async function waitForReady() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) {
        openBrowser();
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function shutdown(exitCode, signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (postgresStartedByUs) {
    await stopManagedPostgres();
  }

  process.exit(signal ? 128 : exitCode);
}

console.log(`\n  Next dev server starting on ${url}\n`);

await ensureEnvFile();

try {
  const postgres = await ensurePostgres();
  postgresStartedByUs = postgres.startedByUs;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const child = spawn(nextBin, ["dev", "-p", port], {
  stdio: "inherit",
  env: process.env,
});

void waitForReady();

child.on("exit", (code, signal) => {
  if (signal) {
    void shutdown(130, true);
    return;
  }
  void shutdown(code ?? 0, false);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
