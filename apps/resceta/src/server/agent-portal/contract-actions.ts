"use server";

import { redirect } from "next/navigation";
import { requestSigningLink } from "@servd/core/agent-kit";
import { requireStaff } from "@/server/tenancy/current-user";
import { portalConfig } from "./config";
import { flushOutboxQuietly } from "./outbox";

/** Send the owner to the portal's shared signing page. */
export async function openSigningPage(): Promise<{ error: string } | void> {
  let pharmacyId: string;
  try {
    ({ pharmacyId } = await requireStaff("manageSettings"));
  } catch {
    return { error: "Only the owner can sign the agreement." };
  }
  const config = portalConfig();
  if (!config) return { error: "Signing isn't available yet. Please contact support." };
  await flushOutboxQuietly();
  const link = await requestSigningLink(config, pharmacyId);
  if (!link) return { error: "Your account is still being set up. Please try again in a minute." };
  redirect(link.url);
}
