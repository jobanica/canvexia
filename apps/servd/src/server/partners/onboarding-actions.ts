"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";

/**
 * The two onboarding steps a system cannot observe, and the dismissal.
 *
 * `partners.onboardingSteps` was READ in three places and WRITTEN in none, so
 * "Finish the training" and "Book your HQ kickoff call" were permanently
 * unticked and the checklist could never reach 6 of 6. The other four steps are
 * derived from real state (a brand row exists, a slug is set, a payout method is
 * stored, a merchant exists) and always worked. These two cannot be: an embedded
 * YouTube iframe does not tell us it finished, and Google's booking pages send
 * no webhook.
 *
 * So they are what the checklist always said they were — SELF-ASSERTIONS, ticked
 * by the partner. That is honest about what is known. What keeps it from being
 * decorative is that ticking is audited: `partner.onboarding_step` records who
 * ticked what and when, so HQ's Activity tab shows an operator claiming the
 * training rather than the platform claiming it for them.
 *
 * `settings.write` — admin-only — because this is partner-level state, not
 * per-seat: one row on `partners`, shared by every seat. The same seats that can
 * set the brand, the subdomain and the payout details own the rest of the
 * checklist too.
 */
const STEPS = ["training", "kickoff"] as const;
type StepKey = (typeof STEPS)[number];

const isStep = (v: string): v is StepKey => (STEPS as readonly string[]).includes(v);

type OnboardingJson = { steps?: Record<string, boolean>; dismissedAt?: string | null };

/**
 * Read-modify-write the JSON column inside ONE transaction.
 *
 * `onboardingSteps` is a single JSONB value, so two seats ticking two different
 * steps in the same moment would otherwise have one overwrite the other. The
 * read happens on `tx`, inside the same transaction as the write, which is what
 * makes the merge safe.
 *
 * `select` is named rather than bare: this runs on every tick and a column added
 * to `partners` later must not start arriving here.
 */
async function mutate(
  partnerId: string,
  actorEmail: string,
  action: string,
  apply: (current: OnboardingJson) => OnboardingJson,
): Promise<void> {
  await systemDb(async (tx) => {
    const row = await tx.partner.findUnique({
      where: { id: partnerId },
      select: { onboardingSteps: true },
    });
    const before = ((row?.onboardingSteps as OnboardingJson | null) ?? {}) satisfies OnboardingJson;
    const after = apply(before);

    await tx.partner.update({
      where: { id: partnerId },
      data: { onboardingSteps: after },
      select: { id: true },
    });
    await writePartnerAudit(tx, partnerId, {
      actorEmail,
      action,
      entityType: "partner",
      entityId: partnerId,
      before,
      after,
    });
  });
  revalidatePath("/partner");
}

/**
 * Tick or untick one of the two stored steps.
 *
 * Untickable on purpose: a partner who ticked "training" by accident should be
 * able to put it back rather than live with a checklist that lies. The audit row
 * records both directions.
 */
export async function setOnboardingStepAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("settings.write");
  if (!who) return;

  const key = String(formData.get("key") ?? "").trim();
  if (!isStep(key)) return;
  const done = String(formData.get("done") ?? "") === "true";

  await mutate(who.partnerId, who.email, "partner.onboarding_step", (current) => ({
    ...current,
    steps: { ...(current.steps ?? {}), [key]: done },
  }));
}

/**
 * Hide the checklist, or bring it back.
 *
 * `dismissedAt` was the third half-wired field in this object — read, typed,
 * threaded to the page, and never set by anything. A partner who has finished
 * the four derived steps and does not want a kickoff call had no way to stop
 * being asked. Dismissing does NOT tick anything: the steps stay as they are, so
 * the checklist tells the truth if it is ever brought back.
 */
export async function dismissOnboardingAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("settings.write");
  if (!who) return;

  const restore = String(formData.get("restore") ?? "") === "true";
  await mutate(
    who.partnerId,
    who.email,
    restore ? "partner.onboarding_restored" : "partner.onboarding_dismissed",
    (current) => ({ ...current, dismissedAt: restore ? null : new Date().toISOString() }),
  );
}
