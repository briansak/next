import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKey } from "./key";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export async function decryptSecret(payload: string): Promise<string | null> {
  const parts = payload.split(":");
  if (parts.length !== 3) return null;

  const [ivB64, ciphertextB64, tagB64] = parts;
  if (!ivB64 || !ciphertextB64 || !tagB64) return null;

  try {
    const key = await getEncryptionKey();
    const iv = Buffer.from(ivB64, "base64");
    const encrypted = Buffer.from(ciphertextB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(value: string, visibleTail = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= visibleTail) {
    return "•".repeat(trimmed.length);
  }
  return `${"•".repeat(Math.max(8, trimmed.length - visibleTail))}${trimmed.slice(-visibleTail)}`;
}
