"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { previousMonthKey } from "@/lib/partners/scorecard";

export type TargetState = { ok?: boolean; error?: string; copied?: number } | null;

const MONTH_RE = /^\d{4}-\d{2}$/;

/** A non-negative integer from a form field, capped at something sane. */
function count(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").replace(/[^\d]/g, "");
  return Math.min(9999, Number(raw) || 0);
}

/**
 * Set one person's targets for one month.
 *
 * AN UPSERT on (partnerUserId, month), which the unique index enforces: a
 * manager editing the same row twice must not create a second target for the
 * same month, and two managers editing at once must not either.
 *
 * Past months are editable. That is deliberate — a target nobody set until the
 * 3rd is still that month's target, and refusing to backfill would leave the
 * scorecard showing "no target" for a month everybody agreed on.
 */
export async function setTargetAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("hr.set_targets");
  if (!who) return;

  const partnerUserId = String(formData.get("partnerUserId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!partnerUserId || !MONTH_RE.test(month)) return;

  // The seat must belong to this partner. Without this, a manager could set a
  // target on somebody else's staff by editing one hidden field.
  const seat = await systemDb((tx) =>
    tx.partnerUser.findFirst({
      where: { id: partnerUserId, partnerId: who.partnerId },
      select: { id: true },
    }),
  );
  if (!seat) return;

  const data = {
    targetMerchants: count(formData, "targetMerchants"),
    targetVisits: count(formData, "targetVisits"),
    targetDemos: count(formData, "targetDemos"),
    setByUserId: who.userId,
  };

  await systemDb(async (tx) => {
    await tx.staffTarget.upsert({
      where: { partnerUserId_month: { partnerUserId, month } },
      create: { partnerId: who.partnerId, partnerUserId, month, ...data },
      update: data,
    });
    await writeSeatAudit(tx, who, {
      action: "partner.target_set",
      entityType: "staff_target",
      entityId: `${partnerUserId}:${month}`,
      after: { month, ...data },
    });
  });

  revalidatePath("/partner/team/scorecard");
  revalidatePath("/partner");
}

/**
 * Copy last month's targets into this one.
 *
 * DOES NOT OVERWRITE. A month where somebody has already been given a target is
 * skipped, because "copy last month" is a shortcut for the rows nobody has got
 * to yet, not an instruction to undo the three a manager already set by hand.
 * The result says how many were copied so that is visible rather than assumed.
 */
export async function copyTargetsAction(
  _prev: TargetState,
  formData: FormData,
): Promise<TargetState> {
  const who = await requireWritablePartner("hr.set_targets");
  if (!who) return { error: "You can't set targets from this account." };

  const month = String(formData.get("month") ?? "");
  if (!MONTH_RE.test(month)) return { error: "Pick a month." };
  const source = previousMonthKey(month);

  const copied = await systemDb(async (tx) => {
    const [previous, existing] = await Promise.all([
      tx.staffTarget.findMany({
        where: { partnerId: who.partnerId, month: source },
        select: {
          partnerUserId: true,
          targetMerchants: true,
          targetVisits: true,
          targetDemos: true,
        },
      }),
      tx.staffTarget.findMany({
        where: { partnerId: who.partnerId, month },
        select: { partnerUserId: true },
      }),
    ]);
    const already = new Set(existing.map((e) => e.partnerUserId));
    const rows = previous.filter((p) => !already.has(p.partnerUserId));
    if (rows.length === 0) return 0;

    await tx.staffTarget.createMany({
      data: rows.map((r) => ({
        partnerId: who.partnerId,
        partnerUserId: r.partnerUserId,
        month,
        targetMerchants: r.targetMerchants,
        targetVisits: r.targetVisits,
        targetDemos: r.targetDemos,
        setByUserId: who.userId,
      })),
    });
    await writeSeatAudit(tx, who, {
      action: "partner.targets_copied",
      entityType: "staff_target",
      entityId: month,
      after: { from: source, to: month, copied: rows.length, skipped: already.size },
    });
    return rows.length;
  });

  revalidatePath("/partner/team/scorecard");
  return copied > 0
    ? { ok: true, copied }
    : { error: `Nothing to copy from ${source} that isn't already set.` };
}
