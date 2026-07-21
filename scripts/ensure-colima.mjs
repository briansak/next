#!/usr/bin/env node
/**
 * Install and start Colima + Docker CLI when Docker is not already available.
 * Used by npm run setup — avoids Docker Desktop licensing for organizations.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hasDocker } from "./postgres-docker.mjs";

const COLIMA_PACKAGES = ["colima", "docker", "docker-compose"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasBrew() {
  return spawnSync("brew", ["--version"], { stdio: "ignore" }).status === 0;
}

function brewInstalled(formula) {
  return spawnSync("brew", ["list", formula], { stdio: "ignore" }).status === 0;
}

function colimaRunning() {
  return spawnSync("colima", ["status"], { stdio: "ignore" }).status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
}

export async function ensureColima() {
  if (hasDocker()) {
    console.log("Docker is ready (Colima or other runtime).");
    return;
  }

  if (!hasBrew()) {
    throw new Error(
      [
        "Homebrew is required so setup can install Colima automatically.",
        "",
        "Install Homebrew: https://brew.sh",
        "Then run: npm run setup",
        "",
        "Or install Colima manually:",
        "  brew install colima docker docker-compose",
        "  colima start",
      ].join("\n")
    );
  }

  const missing = COLIMA_PACKAGES.filter((pkg) => !brewInstalled(pkg));
  if (missing.length > 0) {
    console.log("==> Installing Colima and Docker CLI (Homebrew)…");
    console.log(`    Packages: ${missing.join(", ")}`);
    run("brew", ["install", ...missing]);
  } else {
    console.log("Colima and Docker CLI already installed.");
  }

  if (!colimaRunning()) {
    console.log("==> Starting Colima…");
    run("colima", ["start"]);
  } else {
    console.log("Colima is already running.");
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    if (hasDocker()) {
      console.log("Docker is ready.\n");
      return;
    }
    await sleep(1000);
  }

  throw new Error(
    "Colima started but Docker did not become ready. Try: colima stop && colima start"
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  ensureColima().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
