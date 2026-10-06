import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for the one secret the portal must store and use: each
 * product's API secret. The same format as apps/servd/src/lib/crypto/secrets.ts
 * — base64(iv[12] | tag[16] | ciphertext) under CREDENTIALS_ENCRYPTION_KEY —
 * so a key rotation procedure written for one works for the other.
 *
 * Generate a key: openssl rand -hex 32
 */
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), buf.subarray(0, IV_LEN));
  decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString(
    "utf8",
  );
}

/** A new product API secret: 32 random bytes, prefixed so it is recognisable in a leak scan. */
export function newApiSecret(): string {
  return `cvx_${randomBytes(32).toString("base64url")}`;
}
