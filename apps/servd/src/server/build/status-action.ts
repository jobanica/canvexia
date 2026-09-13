"use server";

import { getActivationStatus, type ActivationStatus } from "./activation";

/**
 * Read-only poll for the success page. It cannot activate anything by itself —
 * it re-reads the request, and if the webhook is late it asks Xendit
 * server-to-server whether the invoice was really paid.
 */
export async function pollActivation(requestId: string): Promise<ActivationStatus | null> {
  return getActivationStatus(requestId);
}
