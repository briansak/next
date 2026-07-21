import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY_BYTES = 32;
const LOCAL_KEY_DIR = path.join(process.cwd(), ".local");
const LOCAL_KEY_FILE = path.join(LOCAL_KEY_DIR, "encryption.key");

let cachedKey: Buffer | null = null;

function deriveKeyFromPassphrase(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase, "utf8").digest();
}

async function readOrCreateLocalKeyFile(): Promise<Buffer> {
  try {
    const existing = await readFile(LOCAL_KEY_FILE, "utf8");
    const decoded = Buffer.from(existing.trim(), "base64");
    if (decoded.length === KEY_BYTES) {
      return decoded;
    }
  } catch {
    // Create a new local key on first use.
  }

  const key = randomBytes(KEY_BYTES);
  await mkdir(LOCAL_KEY_DIR, { recursive: true, mode: 0o700 });
  await writeFile(LOCAL_KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

export async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const envKey = process.env.APP_ENCRYPTION_KEY?.trim();
  if (envKey) {
    const decoded = Buffer.from(envKey, "base64");
    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        "APP_ENCRYPTION_KEY must be 32 bytes encoded as base64 (openssl rand -base64 32)."
      );
    }
    cachedKey = decoded;
    return cachedKey;
  }

  cachedKey = await readOrCreateLocalKeyFile();
  return cachedKey;
}

/** Test-only helper to reset in-memory cache between unit tests. */
export function resetEncryptionKeyCacheForTests(): void {
  cachedKey = null;
}

export function deriveKeyForTests(passphrase: string): Buffer {
  return deriveKeyFromPassphrase(passphrase);
}
