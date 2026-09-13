"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { stepDef } from "@/lib/email/tracks";
import { DEFAULT_COPY } from "@/lib/email/default-copy";
import { runFollowUps, type RunReport } from "./followup";

/**
 * Super-admin controls for the acquisition sequence.
 *
 * Note what is NOT editable here: the timings. Which step fires when is code
 * (lib/email/tracks.ts), because the schedule interacts with rush-hour
 * avoidance and track switching in ways a free-form day number can't express.
 * The words are the thing worth iterating on, so the words are what's editable.
 */

const PATH = "/super-admin/email";

export type FollowUpActionState = { ok?: boolean; error?: string; run?: RunReport } | null;

const templateSchema = z.object({
  subject: z.string().trim().min(3, "Write a subject line").max(150),
  body: z.string().trim().min(10, "Write the message").max(20_000),
});

/** Edit one step's copy. Leads already scheduled get the new words. */
export async function saveTemplate(
  _prev: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  await requireOwnerAction();
  const stepKey = String(formData.get("stepKey") ?? "");
  if (!stepDef(stepKey)) return { error: "Unknown step." };

  const parsed = templateSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    await systemDb((tx) =>
      tx.emailTemplate.upsert({
        where: { stepKey },
        create: { stepKey, ...parsed.data },
        update: { ...parsed.data, updatedAt: new Date() },
      }),
    );
  } catch {
    return { error: "Couldn't save. Run add-acquisition-followup.sql, then retry." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Put the original copy back — an escape hatch from a bad edit. */
export async function resetTemplate(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const stepKey = String(formData.get("stepKey") ?? "");
  const copy = DEFAULT_COPY[stepKey];
  if (!copy) return;
  try {
    await systemDb((tx) =>
      tx.emailTemplate.upsert({
        where: { stepKey },
        create: { stepKey, ...copy },
        update: { ...copy, updatedAt: new Date() },
      }),
    );
  } catch {
    /* not migrated yet */
  }
  revalidatePath(PATH);
}

/**
 * Pause or resume one step. Scheduled rows stay put — a paused step is simply
 * skipped when its turn comes, so resuming later doesn't replay the sequence.
 */
export async function toggleStep(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const stepKey = String(formData.get("stepKey") ?? "");
  const enabled = formData.get("enabled") === "on";
  const copy = DEFAULT_COPY[stepKey];
  if (!stepDef(stepKey)) return;
  try {
    await systemDb((tx) =>
      tx.emailTemplate.upsert({
        where: { stepKey },
        create: {
          stepKey,
          subject: copy?.subject ?? stepKey,
          body: copy?.body ?? "",
          enabled,
        },
        update: { enabled },
      }),
    );
  } catch {
    /* not migrated yet */
  }
  revalidatePath(PATH);
}

/** The master switch. Off means the cron sends nothing at all. */
export async function setFollowUpEnabled(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const enabled = formData.get("enabled") === "on";
  try {
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", emailAutomationOn: enabled },
        update: { emailAutomationOn: enabled },
      }),
    );
  } catch {
    /* not migrated yet */
  }
  revalidatePath(PATH);
}

/**
 * Send whatever is due right now instead of waiting up to 15 minutes for the
 * cron. Same code path as the cron, including every suppression check.
 */
export async function runFollowUpsNow(
  _prev: FollowUpActionState,
  _formData: FormData,
): Promise<FollowUpActionState> {
  await requireOwnerAction();
  const run = await runFollowUps();
  revalidatePath(PATH);
  if (!run.enabled) return { error: "Turn the follow-up on first." };
  return { ok: true, run };
}
