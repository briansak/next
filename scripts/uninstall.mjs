#!/usr/bin/env node
/**
 * Remove local Next data: Postgres (Docker volume or .local/pgdata) + encryption key.
 * Does not delete the app source or .env.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { removeManagedPostgresData } from "./postgres.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIR = path.join(ROOT, ".local");

async function uninstall() {
  console.log("==> Next — uninstall local data\n");

  const removedDb = await removeManagedPostgresData();
  if (removedDb) {
    console.log("Removed local Postgres data (Docker volume or .local/pgdata).");
  } else {
    console.log("Could not remove Postgres data automatically.");
    console.log("If you used an external database, drop the `next` database manually.");
  }

  try {
    await rm(LOCAL_DIR, { recursive: true, force: true });
    console.log("Removed .local/ (encryption key and any remaining local data).");
  } catch {
    console.log("No .local/ directory to remove.");
  }

  console.log("");
  console.log("Local app data removed.");
  console.log("");
  console.log("Next steps:");
  console.log("  • Run npm run setup  — fresh database and seed");
  console.log("  • Delete this project folder — remove the app entirely");
  console.log("  • Delete .env manually — only if you want to reset the database URL");
  console.log("");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await uninstall();
}
