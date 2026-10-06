"use server";

import { headers } from "next/headers";
import { signContract } from "@/server/contracts";
import type { FormState } from "@/lib/form-state";

/**
 * The customer signs. No login — the token in the URL is the authority, and
 * it names exactly one customer. IP and user agent are recorded on the
 * contract as evidence of where it was signed from.
 */
export async function signAction(token: string, _p: FormState, fd: FormData): Promise<FormState> {
  const h = await headers();
  const result = await signContract(token, {
    signerName: String(fd.get("signerName") ?? ""),
    signerPosition: String(fd.get("signerPosition") ?? ""),
    signerPhone: String(fd.get("signerPhone") ?? ""),
    signatureDataUrl: String(fd.get("signature") ?? ""),
    agreed: fd.get("agree") === "on",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  });
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "done", message: "Signed. Thank you — a copy is kept on file and your provider has been notified." };
}
