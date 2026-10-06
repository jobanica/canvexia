"use server";

import { revalidatePath } from "next/cache";
import { requireAgent } from "@/server/auth";
import { requestPayoutChange } from "@/server/payout-changes";
import { parseApplication } from "@/lib/application";
import { authFailure, formStrings, type FormState } from "@/lib/form-state";

export async function requestChangeAction(_p: FormState, fd: FormData): Promise<FormState> {
  let agent;
  try { agent = await requireAgent(); } catch (e) { return authFailure(e); }
  // Reuse the application's payout validation; the other fields are filled to pass it.
  const parsed = parseApplication({
    ...formStrings(fd),
    name: agent.name,
    mobile: "09170000000",
    agreementVersion: "1",
    accept: "on",
  });
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const { payoutMethod, payoutAccountName, payoutAccountNumber } = parsed.input;
  const r = await requestPayoutChange(agent, { payoutMethod, payoutAccountName, payoutAccountNumber });
  if (!r.ok) return { status: "error", message: r.error };
  revalidatePath("/profile");
  return { status: "done", message: "Request sent. An admin will confirm it with you before it takes effect." };
}
