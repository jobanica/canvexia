"use server";

import { currentBuild } from "./session";
import { getBuildState, MIN_PREVIEW_ITEMS } from "./queries";
import { rateLimit } from "./rate-limit";
import { createActivationCheckout } from "./activation";

/**
 * Step ④ — "Activate for ₱499". Creates the pending request + hosted Xendit
 * invoice and hands back the URL for the browser to redirect to.
 *
 * Note what this does NOT do: it never marks anything paid or active. Only the
 * verified webhook can do that (see activation.ts).
 */
export async function requestActivation(): Promise<
  { ok: true; checkoutUrl: string; requestId: string } | { ok: false; error: string }
> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };

  const limited = await rateLimit("build:activate");
  if (!limited.ok) return { ok: false, error: limited.error! };

  const state = await getBuildState(ctx.token);
  if (!state) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };
  if (state.items.length < MIN_PREVIEW_ITEMS) {
    return { ok: false, error: `Add at least ${MIN_PREVIEW_ITEMS} menu items first.` };
  }

  const res = await createActivationCheckout(ctx.restaurantId);
  if (!res.ok) return res;
  return { ok: true, checkoutUrl: res.checkout.checkoutUrl, requestId: res.checkout.requestId };
}
