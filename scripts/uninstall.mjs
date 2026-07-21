#!/usr/bin/env node
/**
 * Remove local Next data: Docker Postgres volume + encrypted secrets key.
 * Does not delete the app source or .env.
 */
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.yml");
const LOCAL_DIR = path.join(ROOT, ".local");

function hasDocker() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  return result.status === 0;
}

async function uninstall() {
  console.log("==> Next — uninstall local data\n");

  if (hasDocker()) {
    console.log("Removing Docker Postgres container and database volume…");
    const result = spawnSync(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "down", "-v"],
      { cwd: ROOT, stdio: "inherit" }
    );
    if (result.status !== 0) {
      console.error("Warning: docker compose down failed (is Docker running?)");
    }
  } else {
    console.log("Docker not found — skipped container/volume removal.");
    console.log("If you used Docker Postgres, run manually:");
    console.log(`  docker compose -f ${COMPOSE_FILE} down -v`);
  }

  try {
    await rm(LOCAL_DIR, { recursive: true, force: true });
    console.log("Removed .local/ (encryption key).");
  } catch {
    console.log("No .local/ directory to remove.");
  }

  console.log("");
  console.log("Local app data removed. Your settings, communications, and Webex tokens");
  console.log("in Postgres are gone if the Docker volume was deleted.");
  console.log("");
  console.log("Next steps:");
  console.log("  • Run npm run setup  — fresh database and seed");
  console.log("  • Delete this project folder — remove the app entirely");
  console.log("  • Delete .env manually — only if you want to clear overrides");
  console.log("");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await uninstall();
}
