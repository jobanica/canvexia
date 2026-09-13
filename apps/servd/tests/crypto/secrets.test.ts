import { describe, it, expect, beforeAll } from "vitest";

// A fixed 32-byte (64 hex) key for deterministic tests.
beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("secrets (AES-256-GCM)", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secrets");
    const enc = encryptSecret("sk_live_supersecret");
    expect(enc).not.toContain("supersecret");
    expect(decryptSecret(enc)).toBe("sk_live_supersecret");
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("detects tampering via the auth tag", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secrets");
    const enc = encryptSecret("hello");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
  });

  it("round-trips JSON credentials", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/crypto/secrets");
    const creds = { secretKey: "sk_1", webhookSecret: "whsk_2" };
    expect(decryptJson(encryptJson(creds))).toEqual(creds);
  });
});
