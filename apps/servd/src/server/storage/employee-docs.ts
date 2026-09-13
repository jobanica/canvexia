import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

export const EMPLOYEE_DOC_BUCKET = "employee-documents";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Uploads an employee document (PDF/image) to Supabase Storage, namespaced by
 * restaurant + employee. NOTE: HR documents are sensitive — use a PRIVATE bucket
 * named `employee-documents` (unlike the public menu buckets). This returns the
 * storage path; serve via signed URLs.
 */
export async function uploadEmployeeDoc(
  restaurantId: string,
  employeeId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Unsupported file. Use PDF, JPEG, PNG, or WebP.");
  }
  if (file.size > MAX_BYTES) throw new Error("File too large. Max 10 MB.");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, EMPLOYEE_DOC_BUCKET, false); // private — HR docs
  const path = `${restaurantId}/${employeeId}/${randomUUID()}.${EXT[file.type]}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(EMPLOYEE_DOC_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Signed URL (private bucket) valid for a week; refresh on demand.
  const { data } = await supabase.storage
    .from(EMPLOYEE_DOC_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return { path, url: data?.signedUrl ?? "" };
}
