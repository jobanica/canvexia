import "server-only";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";
import {
  canActivatePharmacy,
  type ActivationCheck,
} from "@/lib/partners/pharmacy-activation";

/**
 * The pharmacies a partner owns, and switching one on.
 *
 * Resceta's merchants live in `pharmacies`, not `restaurants` (D29) — a second
 * merchant axis rather than a column on the first. The partner portal therefore
 * has to ask a second question to show a partner everything they own, and this
 * is that question.
 *
 * Read and write both go through partnerDb(), never systemDb(). The policy
 * resolves `pharmacies."partnerId"`, so a partner naming somebody else's
 * pharmacy id gets zero rows rather than somebody else's pharmacy — which is
 * the guarantee that matters on a screen with a button that changes status.
 */

export interface PartnerPharmacyRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  /** Present or not — never the number itself; the portal has no use for it. */
  hasLto: boolean;
  createdAt: string;
  /** Precomputed so the list and the button cannot disagree. */
  activation: ActivationCheck;
}

export async function listPartnerPharmacies(
  partnerId: string,
): Promise<PartnerPharmacyRow[]> {
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.pharmacy.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          fdaLtoNumber: true,
          createdAt: true,
        },
      }),
    );
    return rows.map((p) => ({
      id: p.id,
      name: p.displayName || p.name,
      slug: p.slug,
      status: p.status,
      hasLto: !!p.fdaLtoNumber?.trim(),
      createdAt: p.createdAt.toISOString(),
      activation: canActivatePharmacy({ status: p.status, fdaLtoNumber: p.fdaLtoNumber }),
    }));
  } catch {
    // The pharmacy tables may not exist on a database that predates Resceta.
    // An empty section, not a broken dashboard.
    return [];
  }
}

export type ActivateOutcome =
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * Switch a pharmacy on.
 *
 * Re-reads and re-checks inside the transaction rather than trusting what the
 * page rendered: the button was drawn from a snapshot, and between the render
 * and the click the pharmacy may have been suspended, activated by somebody
 * else, or had its licence cleared.
 *
 * The audit row is written in the SAME transaction. A status change on a
 * regulated merchant that is not attributable to a person is the one outcome
 * this must not produce, so it cannot be a second call that might not happen.
 */
export async function activatePharmacy(input: {
  partnerId: string;
  pharmacyId: string;
  actorEmail: string;
}): Promise<ActivateOutcome> {
  const found = await partnerDb(input.partnerId, (tx) =>
    tx.pharmacy.findFirst({
      where: { id: input.pharmacyId, partnerId: input.partnerId },
      select: { id: true, name: true, displayName: true, status: true, fdaLtoNumber: true },
    }),
  );
  // Not found and not yours are the same answer here, deliberately: a partner
  // probing ids should not learn which of the two it was.
  if (!found) return { ok: false, message: "That pharmacy was not found." };

  const check = canActivatePharmacy({
    status: found.status,
    fdaLtoNumber: found.fdaLtoNumber,
  });
  if (!check.ok) return { ok: false, message: check.message };

  await systemDb(async (tx) => {
    await tx.pharmacy.update({
      where: { id: found.id },
      data: { status: "active", updatedAt: new Date() },
    });
    await writePartnerAudit(tx, input.partnerId, {
      actorEmail: input.actorEmail,
      action: "pharmacy.activate",
      entityType: "pharmacy",
      entityId: found.id,
      // What was asserted, and on what basis. "Activated" alone does not answer
      // the question an inspection asks.
      reason: `FDA LTO on file: ${found.fdaLtoNumber}`,
      before: { status: found.status },
      after: { status: "active" },
    });
  });

  return { ok: true, name: found.displayName || found.name };
}

/**
 * ONE pharmacy's activation state, for its own merchant page.
 *
 * REPORTED — "I tried to create a merchant for Resceta, but I don't know where
 * to activate it." The control existed and lived in exactly one place: a card
 * on the partner-wide overview. `/partner` forks before that card — a seat
 * without `merchants.view_all` gets "My day" instead — so a field agent who had
 * just opened a pharmacy could not reach it at all, and an operator had to know
 * to scroll their dashboard rather than open the account they had just created.
 *
 * The fourth dead end of the same shape in this area, after the merchant form,
 * the login handover and the field app's subject list. The answer is the same
 * one: put it on the thing it acts on.
 *
 * Returns null for a merchant that is not a pharmacy or not this partner's —
 * the caller renders nothing, and a forged id learns nothing either way.
 */
export async function pharmacyActivation(
  partnerId: string,
  pharmacyId: string,
): Promise<{ status: string; hasLto: boolean; activation: ActivationCheck } | null> {
  try {
    const row = await partnerDb(partnerId, (tx) =>
      tx.pharmacy.findFirst({
        where: { id: pharmacyId, partnerId },
        select: { status: true, fdaLtoNumber: true },
      }),
    );
    if (!row) return null;
    return {
      status: row.status,
      hasLto: !!row.fdaLtoNumber?.trim(),
      activation: canActivatePharmacy({ status: row.status, fdaLtoNumber: row.fdaLtoNumber }),
    };
  } catch {
    return null;
  }
}
