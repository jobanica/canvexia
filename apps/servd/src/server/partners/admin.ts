"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";

function revalidate() {
  revalidatePath("/super-admin/partners");
}

export type TrainingState = { ok?: boolean; error?: string } | null;

/** Set (or clear) the partner training video URL shown on the partner dashboard. */
export async function setPartnerTrainingUrl(
  _prev: TrainingState,
  formData: FormData,
): Promise<TrainingState> {
  await requireOwnerAction();
  const url = String(formData.get("url") ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return { error: "Enter a full URL starting with http(s):// (or leave blank to remove)." };
  }
  try {
    await systemDb((tx) =>
      tx.programSetting.upsert({
        where: { id: "program" },
        create: { id: "program", partnerTrainingUrl: url || null },
        update: { partnerTrainingUrl: url || null },
      }),
    );
  } catch {
    return { error: "Couldn't save the training video URL." };
  }
  revalidatePath("/super-admin/partners");
  revalidatePath("/partner");
  return { ok: true };
}

/**
 * Approve / reject / suspend a partner.
 *
 * Approving used to issue a referral code as well, because that code was how
 * their commission was tracked. There is no commission now — a partner sets
 * restaurants up directly and bills them itself — so approval is just approval.
 */
export async function setPartnerStatus(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "suspended", "rejected", "pending"].includes(status)) return;

  await systemDb((tx) => tx.partner.update({ where: { id }, data: { status } }));
  revalidate();
}
