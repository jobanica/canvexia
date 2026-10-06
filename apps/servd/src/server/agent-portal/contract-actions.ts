"use server";

import { redirect } from "next/navigation";
import { requestSigningLink } from "@servd/core/agent-kit";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { portalConfig } from "./config";
import { flushOutboxQuietly } from "./outbox";

/**
 * Send the owner to the agent portal's signing page for their restaurant.
 * The portal hosts it so every product shares one implementation; Servd only
 * asks for the link.
 */
export async function openSigningPage(): Promise<{ error: string } | void> {
  let restaurantId: string;
  try {
    ({ restaurantId } = await requireAdminAction());
  } catch {
    return { error: "Only the owner can sign the agreement." };
  }
  const config = portalConfig();
  if (!config) return { error: "Signing isn't available yet. Please contact support." };
  // The signup event may still be in the outbox; nudge it before asking.
  await flushOutboxQuietly();
  const link = await requestSigningLink(config, restaurantId);
  if (!link) return { error: "Your account is still being set up. Please try again in a minute." };
  redirect(link.url);
}
