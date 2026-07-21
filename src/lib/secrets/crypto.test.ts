import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, maskSecret } from "./crypto";
import { deriveKeyForTests, resetEncryptionKeyCacheForTests } from "./key";

describe("encryptSecret", () => {
  it("round-trips plaintext", async () => {
    process.env.APP_ENCRYPTION_KEY = deriveKeyForTests("test-key").toString("base64");
    resetEncryptionKeyCacheForTests();

    const encrypted = await encryptSecret("super-secret");
    expect(encrypted).not.toContain("super-secret");
    expect(await decryptSecret(encrypted)).toBe("super-secret");

    delete process.env.APP_ENCRYPTION_KEY;
    resetEncryptionKeyCacheForTests();
  });
});

describe("maskSecret", () => {
  it("masks all but the last few characters", () => {
    expect(maskSecret("abcdefgh")).toMatch(/•+efgh$/);
  });
});
