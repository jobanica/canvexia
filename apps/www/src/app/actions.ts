"use server";

import { revalidateTag } from "next/cache";
import { joinWaitlistIn } from "@servd/db";
import { WaitlistInput, firstMessage } from "@/lib/waitlist-input";
import { systemDb } from "@/server/scoped-db";
import { rateLimitWaitlist } from "@/server/rate-limit";

/**
 * Joining the waitlist.
 *
 * A server action, not a browser write — the brief's own rule, and the reason
 * `partner_waitlist` needs no `anon` grant at all. The schema lives in
 * `lib/waitlist-input.ts` because a `"use server"` file may only export async
 * functions, so a schema declared here could not be tested.
 *
 * NO CONFIRMATION EMAIL YET, deliberately. The Resend provider in this repo
 * reads its API key out of `platform_settings.emailCredsEnc` and decrypts it
 * with `CREDENTIALS_ENCRYPTION_KEY`, which is unset on every deployment and has
 * never had a key entered. Wiring a send that silently no-ops would be worse
 * than not having one: people would be told to check their inbox. The success
 * state below says what actually happens instead.
 */

export type WaitlistState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; city: string; position: number; alreadyOn: boolean };

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Before parsing, not after: a script posting rubbish should not get free
  // validation passes out of this endpoint.
  const limited = await rateLimitWaitlist();
  if (!limited.ok) {
    return { status: "error", message: limited.message ?? "Try again in a little while." };
  }

  const parsed = WaitlistInput.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    mobile: formData.get("mobile") ?? "",
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    currentWork: formData.get("currentWork") ?? "",
    hoursPerWeek: formData.get("hoursPerWeek") ?? "",
    soldBefore: formData.get("soldBefore"),
    soldWhat: formData.get("soldWhat") ?? "",
    howHeard: formData.get("howHeard") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: firstMessage(parsed.error) };
  }

  try {
    const result = await systemDb((tx) =>
      joinWaitlistIn(tx, { ...parsed.data, source: "www" }),
    );

    // Section 9 counts these. A new applicant should see their own city appear.
    revalidateTag("waitlist");

    return {
      status: "done",
      city: result.city,
      position: result.position,
      alreadyOn: result.alreadyOn,
    };
  } catch {
    // The applicant cannot fix a database problem, so they are not shown one.
    // What they can do is reach a person, so they are given the way to.
    return {
      status: "error",
      message: "Something went wrong on our side. Message us and we'll add you by hand.",
    };
  }
}
