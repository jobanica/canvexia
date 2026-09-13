import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Symmetric encryption for secrets we must store but never expose — each
 * restaurant's PayMongo credentials (connected-accounts model).
 *
 * AES-256-GCM gives us confidentiality AND integrity (the auth tag detects
 * tampering). The key comes from CREDENTIALS_ENCRYPTION_KEY (32 bytes, hex or
 * base64). Stored format: base64( iv[12] | authTag[16] | ciphertext ).
 *
 * Generate a key:  openssl rand -hex 32
 */

const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  const key =
    /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Encrypt/decrypt a JSON object as one blob. */
export function encryptJson(obj: unknown): string {
  return encryptSecret(JSON.stringify(obj));
}
export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}
