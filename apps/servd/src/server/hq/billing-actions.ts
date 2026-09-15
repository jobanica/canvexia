"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { freezeStatement, monthKeyOf, previousMonth } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction } from "./auth";
import { ADJUSTMENT_KINDS } from "./billing";

export type BillingState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Freeze the month for every eligible partner.
 *
 * ONE TRANSACTION PER PARTNER, not one over all of them: a single transaction
 * means one bad row leaves nobody with a statement. `freezeStatement` is
 * idempotent on (partnerId, month), so a second run cannot double anything or
 * move a status HQ has since set to paid.
 *
 * The run is RECORDED whatever happens. A run that fired and produced nothing
 * looks identical to a run that never fired unless somebody writes down that it
 * happened — which is the exact failure this console had before H1: the cron
 * had returned 401 on every firing since it shipped, and nothing said so.
 */
export async function runStatementsAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  let actor;
  try {
    actor = await requireHqAction("billing.run");
  } catch {
    return { status: "error", message: "You do not have permission to run statements." };
  }

  const month = String(formData.get("month") ?? "").trim() || previousMonth(monthKeyOf(new Date()));
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { status: "error", message: "That is not a month." };
  }

  const started = new Date();
  const partners = await systemDb((tx) =>
    tx.partner.findMany({
      where: { status: "approved", tier: "operator" },
      select: { id: true, name: true },
    }),
  );

  let created = 0;
  let existed = 0;
  const failed: string[] = [];

  for (const p of partners) {
    try {
      const r = await systemDb((tx) => freezeStatement(tx, p.id, month));
      if (r.created) created += 1;
      else existed += 1;
    } catch {
      failed.push(p.name);
    }
  }

  try {
    await systemDb(async (tx) => {
      await tx.cronRun.create({
        data: {
          job: "freeze-statements",
          startedAt: started,
          finishedAt: new Date(),
          ok: failed.length === 0,
          detail: { month, partners: partners.length, created, existed, failed, by: actor.email },
        },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "billing.run",
        entityType: "partner_statement",
        after: { month, created, existed, failed: failed.length },
      });
    });
  } catch {
    /* the statements are frozen either way; the record of the run is secondary */
  }

  revalidatePath("/hq/billing");
  revalidatePath("/hq");

  if (failed.length > 0) {
    return {
      status: "error",
      message: `Froze ${created} (${existed} already closed). Failed: ${failed.join(", ")}.`,
    };
  }
  return {
    status: "done",
    message: `${month} closed. ${created} frozen, ${existed} already were.`,
  };
}

/** Mark a payout sent or an invoice paid, with a date and a reference. */
export async function markStatementPaidAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  let actor;
  try {
    actor = await requireHqAction("billing.run");
  } catch {
    return { status: "error", message: "You do not have permission to settle statements." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const paidOn = String(formData.get("paidOn") ?? "").trim();
  const unpay = formData.get("unpay") === "yes";

  if (!unpay && !reference) {
    return { status: "error", message: "Record the reference — this is somebody's proof." };
  }

  try {
    const message = await systemDb(async (tx) => {
      const before = await tx.partnerStatement.findUnique({
        where: { id },
        select: {
          month: true,
          payoutStatus: true,
          paidAt: true,
          note: true,
          partner: { select: { name: true, collectionMode: true } },
        },
      });
      if (!before) throw new Error("GONE");

      const paidAt = unpay ? null : paidOn ? new Date(`${paidOn}T00:00:00+08:00`) : new Date();
      await tx.partnerStatement.update({
        where: { id },
        data: {
          payoutStatus: unpay ? "pending" : "paid",
          paidAt,
          // The reference goes in the note, which the partner SEES. That is the
          // point: "paid" with no evidence is an assertion, and the operator is
          // the one who has to reconcile it against their bank.
          note: unpay ? null : reference,
        },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: unpay ? "billing.unpaid" : "billing.paid",
        entityType: "partner_statement",
        entityId: id,
        before: { payoutStatus: before.payoutStatus, paidAt: before.paidAt?.toISOString() ?? null },
        after: { payoutStatus: unpay ? "pending" : "paid", reference: reference || null },
      });

      const noun = before.partner.collectionMode === "hq_collects" ? "Payout" : "Invoice";
      return unpay
        ? `${noun} for ${before.month} is pending again.`
        : `${noun} for ${before.month} marked paid.`;
    });

    revalidatePath("/hq/billing");
    return { status: "done", message };
  } catch (e) {
    if (e instanceof Error && e.message === "GONE") {
      return { status: "error", message: "That statement no longer exists." };
    }
    return { status: "error", message: "Could not update that statement." };
  }
}

/**
 * A credit, debit, refund or waiver.
 *
 * A LEDGER ROW, never an edit. `partner_ledger_entries` is append-only and is
 * what `computeStatement` reads, so an adjustment lands in whichever month it
 * OCCURRED in and every statement recomputes consistently. A parallel
 * adjustments table is how a statement and its explanation come to disagree.
 *
 * SUPER ADMIN ONLY. This is money leaving CANVEXIA's pocket on somebody's say
 * so, and it is one of the four things the brief denies to ops.
 *
 * The sign convention, stated because it is the thing to get wrong:
 *   credit / waiver — money TO the partner: positive partnerAmount.
 *   debit           — money BACK from the partner: negative.
 *   refund          — a settlement reversed: the whole row is negative, split
 *                     at the rate that applied when it settled.
 */
export async function createAdjustmentAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  let actor;
  try {
    actor = await requireHqAction("billing.adjust");
  } catch {
    return { status: "error", message: "Only a super admin can adjust a ledger." };
  }

  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const productId = String(formData.get("productId") ?? "servd").trim();
  const merchantId = String(formData.get("merchantId") ?? "").trim() || "—";
  const reason = String(formData.get("reason") ?? "").trim();
  const typed = String(formData.get("confirm") ?? "").trim().replace(/[,₱\s]/g, "");
  const rawPesos = String(formData.get("amount") ?? "").trim().replace(/[,₱\s]/g, "");
  const occurredOn = String(formData.get("occurredOn") ?? "").trim();

  if (!(ADJUSTMENT_KINDS as readonly string[]).includes(kind)) {
    return { status: "error", message: "Pick what kind of adjustment this is." };
  }
  if (reason.length < 4) {
    return { status: "error", message: "Say why. An unexplained movement of money is the one you will be asked about." };
  }

  const pesos = Number(rawPesos);
  if (!Number.isFinite(pesos) || pesos <= 0) {
    return { status: "error", message: "Enter an amount in pesos." };
  }
  // The typed confirmation the brief asks for on money-affecting actions: the
  // amount again, checked server-side. A client-side dialog is a suggestion.
  if (Number(typed) !== pesos) {
    return { status: "error", message: "Type the amount again to confirm it." };
  }

  const centavos = Math.round(pesos * 100);

  try {
    const message = await systemDb(async (tx) => {
      const p = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, revenueSharePct: true },
      });
      if (!p) throw new Error("NO_PARTNER");

      // Direction. A debit takes money back, so every figure is negative —
      // computeStatement sums the stored splits and never re-derives them.
      const sign = kind === "debit" || kind === "refund" ? -1 : 1;
      const gross = sign * centavos;
      // A credit or waiver is HQ giving the partner money: it is theirs in
      // full, and CANVEXIA's side is zero. A refund reverses a settlement, so
      // it splits at the partner's rate the way the original did.
      const partnerAmount =
        kind === "refund" ? Math.round((gross * p.revenueSharePct) / 100) : gross;
      const hqAmount = gross - partnerAmount;

      const entry = await tx.partnerLedgerEntry.create({
        data: {
          partnerId,
          productId,
          merchantId,
          kind,
          // An adjustment has no gateway reference, and providerRef is UNIQUE —
          // it is what makes settlement idempotent. A synthetic one, never
          // reused.
          providerRef: `adj:${randomUUID()}`,
          grossAmount: gross,
          partnerAmount,
          hqAmount,
          sharePct: p.revenueSharePct,
          occurredAt: occurredOn ? new Date(`${occurredOn}T12:00:00+08:00`) : new Date(),
          adjustmentReason: reason,
          actorEmail: actor.email,
        },
        select: { id: true, occurredAt: true },
      });

      await writeHqAudit(tx, {
        partnerId,
        actorEmail: actor.email,
        action: `billing.${kind}`,
        entityType: "partner_ledger_entry",
        entityId: entry.id,
        reason,
        after: { grossCentavos: gross, partnerCentavos: partnerAmount, hqCentavos: hqAmount },
      });

      return `₱${pesos.toLocaleString("en-PH")} ${kind} recorded against ${p.name} for ${monthKeyOf(entry.occurredAt)}.`;
    });

    revalidatePath("/hq/billing");
    revalidatePath("/hq");
    return { status: "done", message };
  } catch (e) {
    if (e instanceof Error && e.message === "NO_PARTNER") {
      return { status: "error", message: "That partner no longer exists." };
    }
    return { status: "error", message: "Could not record that adjustment." };
  }
}

/** Set what a channel costs and what CANVEXIA adds. */
export async function savePassthroughAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  let actor;
  try {
    actor = await requireHqAction("billing.adjust");
  } catch {
    return { status: "error", message: "Only a super admin can change pass-through pricing." };
  }

  const channel = String(formData.get("channel") ?? "").trim();
  if (channel !== "sms" && channel !== "email") {
    return { status: "error", message: "Unknown channel." };
  }
  const perThousand = Number(String(formData.get("unitCostCentavos") ?? "").replace(/[,\s]/g, ""));
  const marginPct = Number(String(formData.get("marginPct") ?? "").replace(/[,\s%]/g, ""));

  if (!Number.isFinite(perThousand) || perThousand < 0) {
    return { status: "error", message: "The unit cost is not a number." };
  }
  if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 500) {
    return { status: "error", message: "The margin has to be between 0 and 500%." };
  }

  try {
    await systemDb(async (tx) => {
      const before = await tx.passthroughCost.findUnique({ where: { channel } });
      await tx.passthroughCost.upsert({
        where: { channel },
        create: {
          channel,
          unitCostCentavos: Math.round(perThousand),
          marginPct: Math.round(marginPct),
        },
        update: {
          unitCostCentavos: Math.round(perThousand),
          marginPct: Math.round(marginPct),
          note: null,
        },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "billing.passthrough_set",
        entityType: "passthrough_cost",
        entityId: channel,
        before: before
          ? { unitCostCentavos: before.unitCostCentavos, marginPct: before.marginPct }
          : null,
        after: { unitCostCentavos: Math.round(perThousand), marginPct: Math.round(marginPct) },
      });
    });
    revalidatePath("/hq/billing");
    return { status: "done", message: `${channel.toUpperCase()} pricing saved.` };
  } catch {
    return { status: "error", message: "Could not save that." };
  }
}
