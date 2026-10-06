import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { canActivatePharmacy, type ActivationCheck } from "@/lib/partners/pharmacy-activation";

/**
 * Pharmacies, from HQ.
 *
 * Switching a pharmacy on was a partner-portal action (D36). The partner
 * portal is retired (D38), so HQ does it here — under the same rule: refused
 * until the FDA Licence to Operate is on file, refused for a suspended
 * pharmacy, and written to the audit log in the same transaction with who did
 * it and the licence number they acted on.
 */

export interface PharmacyRow {
  id: string;
  name: string;
  status: string;
  fdaLtoNumber: string | null;
  createdAt: Date;
  activation: ActivationCheck;
}

export async function listPharmacies(): Promise<PharmacyRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.pharmacy.findMany({
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { id: true, name: true, displayName: true, status: true, fdaLtoNumber: true, createdAt: true },
      }),
    );
    return rows.map((p) => ({
      id: p.id,
      name: p.displayName || p.name,
      status: p.status,
      fdaLtoNumber: p.fdaLtoNumber,
      createdAt: p.createdAt,
      activation: canActivatePharmacy({ status: p.status, fdaLtoNumber: p.fdaLtoNumber }),
    }));
  } catch {
    // A database that predates Resceta has no pharmacy tables.
    return [];
  }
}

export type ActivateOutcome = { ok: true; name: string } | { ok: false; message: string };

/**
 * Re-reads and re-checks inside the transaction rather than trusting the page:
 * between render and click the pharmacy may have been suspended, activated by
 * someone else, or had its licence cleared.
 */
export async function activatePharmacyAsHq(input: { pharmacyId: string; actorEmail: string }): Promise<ActivateOutcome> {
  return systemDb(async (tx) => {
    await tx.$queryRaw`select id from pharmacies where id = ${input.pharmacyId} for update`;
    const found = await tx.pharmacy.findUnique({
      where: { id: input.pharmacyId },
      select: { id: true, name: true, displayName: true, status: true, fdaLtoNumber: true },
    });
    if (!found) return { ok: false as const, message: "That pharmacy was not found." };
    const check = canActivatePharmacy({ status: found.status, fdaLtoNumber: found.fdaLtoNumber });
    if (!check.ok) return { ok: false as const, message: check.message };

    await tx.pharmacy.update({ where: { id: found.id }, data: { status: "active" }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        actorType: "hq",
        actorEmail: input.actorEmail,
        action: "pharmacy.activate",
        entityType: "pharmacy",
        entityId: found.id,
        reason: `FDA LTO on file: ${found.fdaLtoNumber}`,
        before: { status: found.status },
        after: { status: "active" },
      },
    });
    return { ok: true as const, name: found.displayName || found.name };
  });
}
