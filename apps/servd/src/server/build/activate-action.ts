"use server";

import { cookies } from "next/headers";
import { REF_COOKIE } from "@servd/core/agent-kit/ref";
import { currentBuild } from "./session";
import { getBuildState, MIN_PREVIEW_ITEMS } from "./queries";
import { rateLimit } from "./rate-limit";
import { activatePreview } from "./activation";
import { flushOutboxQuietly } from "@/server/agent-portal/outbox";

/**
 * Step ④ — activate. Turns the preview into a real account on manual billing
 * (D38: no gateway checkout any more) and hands back the claim link where the
 * owner sets their password.
 */
export async function requestActivation(): Promise<{ ok: true; nextUrl: string } | { ok: false; error: string }> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };

  const limited = await rateLimit("build:activate");
  if (!limited.ok) return { ok: false, error: limited.error! };

  const state = await getBuildState(ctx.token);
  if (!state) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };
  if (state.items.length < MIN_PREVIEW_ITEMS) {
    return { ok: false, error: `Add at least ${MIN_PREVIEW_ITEMS} menu items first.` };
  }

  const agentCode = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const res = await activatePreview(ctx.restaurantId, agentCode);
  if (!res.ok) return res;
  await flushOutboxQuietly();
  return { ok: true, nextUrl: res.claimUrl };
}
