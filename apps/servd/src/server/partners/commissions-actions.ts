"use server";

import { revalidatePath } from "next/cache";
import type { CommissionRuleType } from "@servd/db";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";

export type CommissionState = { ok?: boolean; error?: string } | null;

const TYPES: CommissionRuleType[] = ["per_signup", "pct_first_month", "pct_recurring", "none"];

/**
 * Add a commission rule for one staff member.
 *
 * `commissions.manage` — ADMIN ONLY, not ops_manager. What a salesperson is
 * paid is a commercial term between them and the operator, in the same class as
 * the revenue share, and an ops manager who could set it could set their own.
 *
 * RULES ARE ADDED, NEVER EDITED. A rule that has already produced a frozen
 * statement is part of the record of what somebody was paid; editing it in
 * place would make the statement and its explanation disagree. Changing the
 * arrangement means ending the old rule and starting a new one, which is also
 * what the two date columns are for.
 */
export async function addCommissionRuleAction(
  _prev: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  const who = await requireWritablePartner("commissions.manage");
  if (!who) return { error: "Only an admin can set commission rules." };

  const partnerUserId = String(formData.get("partnerUserId") ?? "");
  const type = String(formData.get("type") ?? "") as CommissionRuleType;
  if (!TYPES.includes(type)) return { error: "Pick a commission type." };

  const seat = await systemDb((tx) =>
    tx.partnerUser.findFirst({
      where: { id: partnerUserId, partnerId: who.partnerId },
      select: { id: true, email: true },
    }),
  );
  if (!seat) return { error: "That person isn't on your team." };

  // Pesos in the form for a flat fee, PERCENT for a percentage. Stored as
  // centavos and basis points respectively — integers either way, because 2.5%
  // in a float is how a statement ends up a centavo short of its own lines.
  const raw = String(formData.get("value") ?? "").replace(/[^\d.]/g, "");
  const n = Number(raw);
  if (type !== "none" && (!Number.isFinite(n) || n <= 0)) {
    return { error: "Enter an amount." };
  }
  const value =
    type === "per_signup" ? Math.round(n * 100) : Math.round(n * 100); // centavos | basis points

  if (type === "pct_first_month" || type === "pct_recurring") {
    if (n > 100) return { error: "A percentage cannot be more than 100." };
  }

  const appliesTo = String(formData.get("appliesTo") ?? "all_products");
  const productId = String(formData.get("productId") ?? "").trim() || null;
  if (appliesTo === "product" && !productId) return { error: "Pick a product." };

  await systemDb(async (tx) => {
    await tx.commissionRule.create({
      data: {
        partnerId: who.partnerId,
        partnerUserId,
        type,
        value: type === "none" ? 0 : value,
        appliesTo: appliesTo === "product" ? "product" : "all_products",
        productId: appliesTo === "product" ? productId : null,
        createdBy: who.email,
      },
      select: { id: true },
    });
    await writeSeatAudit(tx, who, {
      action: "partner.commission_rule_added",
      entityType: "commission_rule",
      entityId: partnerUserId,
      after: { forEmail: seat.email, type, value, appliesTo, productId },
    });
  });

  revalidatePath("/partner/commissions");
  return { ok: true };
}

/**
 * End a rule, as of now.
 *
 * Not a delete. A rule that produced a statement is part of the record of what
 * somebody was paid, and deleting it would leave a frozen figure with no
 * explanation behind it. `endsAt` is exclusive, so a rule ended today stops
 * covering today.
 */
export async function endCommissionRuleAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("commissions.manage");
  if (!who) return;
  const id = String(formData.get("ruleId") ?? "");
  if (!id) return;

  await systemDb(async (tx) => {
    const n = await tx.commissionRule.updateMany({
      where: { id, partnerId: who.partnerId, endsAt: null },
      data: { endsAt: new Date() },
    });
    if (n.count === 0) return;
    await writeSeatAudit(tx, who, {
      action: "partner.commission_rule_ended",
      entityType: "commission_rule",
      entityId: id,
      after: { endsAt: new Date().toISOString() },
    });
  });
  revalidatePath("/partner/commissions");
}

/**
 * Mark a statement paid.
 *
 * APPEND-ONLY in spirit: a statement already marked paid is not re-marked, so a
 * double submit cannot overwrite the date and reference of the payment that
 * actually happened. Unmarking is not offered — a payment that did not happen
 * is corrected by a note to the person, not by editing the record of it.
 */
export async function markCommissionPaidAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("commissions.manage");
  if (!who) return;

  const statementId = String(formData.get("statementId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120) || null;
  if (!statementId) return;

  await systemDb(async (tx) => {
    const n = await tx.commissionStatement.updateMany({
      where: { id: statementId, partnerId: who.partnerId, paidAt: null },
      data: { paidAt: new Date(), paidReference: reference, paidBy: who.email },
    });
    if (n.count === 0) return;
    await writeSeatAudit(tx, who, {
      action: "partner.commission_paid",
      entityType: "commission_statement",
      entityId: statementId,
      after: { reference },
    });
  });
  revalidatePath("/partner/commissions");
}
