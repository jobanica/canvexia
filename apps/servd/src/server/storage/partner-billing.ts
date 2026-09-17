import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

/**
 * The two pictures the renewal loop runs on.
 *
 * BOTH PRIVATE, read back through a short signed URL.
 *
 * A partner's payment QR moves money to that operator; a permanent guessable
 * URL for it is a thing to be misused, and it does not stop being that because
 * it is convenient. A merchant's receipt is worse — it is a screenshot of
 * somebody's e-wallet, with their name, their number and often their balance
 * on it. Neither belongs in a public bucket.
 *
 * Logos are the exception and live elsewhere (partner-brand, public): they are
 * meant to be seen by diners.
 */
export const BILLING_BUCKET = "partner-billing";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

async function put(path: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("That image is too large — keep it under 5 MB.");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, BILLING_BUCKET, false);
  const full = `${path}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BILLING_BUCKET)
    .upload(full, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return full;
}

/** The partner's payment QR. Namespaced by partner so a listing cannot be walked. */
export function uploadPayQr(partnerId: string, file: File): Promise<string> {
  return put(`qr/${partnerId}`, file);
}

/** A merchant's proof of payment, under the partner who will read it. */
export function uploadReceipt(partnerId: string, merchantId: string, file: File): Promise<string> {
  return put(`receipts/${partnerId}/${merchantId}`, file);
}

/**
 * A short-lived URL for one of these.
 *
 * Ten minutes: long enough to look at a receipt and decide, short enough that a
 * copied link is not a lasting leak. Returns null rather than throwing — a
 * missing picture must not take down the page that lists it.
 */
export async function signBillingFile(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.from(BILLING_BUCKET).createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
