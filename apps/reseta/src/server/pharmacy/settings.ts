import "server-only";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * The pharmacy's own record: the numbers that make a receipt a receipt.
 *
 * Until this existed, `fdaLtoNumber`, `prcLicenseNo` and `tin` could only be
 * set with raw SQL — which meant every receipt printed with blanks where the
 * statutory identifiers go, and the only documented fix was a psql session.
 *
 * Reads are scoped through pharmacyDb. The WRITE runs in systemDb, matching
 * staff.ts, for one reason: the audit row. `audit_logs` sits on the restaurant
 * axis and has no pharmacy policy, so an insert under the pharmacy scope is
 * refused — and splitting the update and its audit row across two transactions
 * is how a change to a compliance field ends up with no trail. The id is never
 * a parameter a browser chose: every caller passes the session's own
 * `pharmacyId` from `requireStaff`.
 */

export interface PharmacySettings {
  name: string;
  displayName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  fdaLtoNumber: string | null;
  prcLicenseNo: string | null;
  vatRatePct: number;
  status: string;
}

const FIELDS = {
  name: true,
  displayName: true,
  address: true,
  phone: true,
  email: true,
  tin: true,
  fdaLtoNumber: true,
  prcLicenseNo: true,
  vatRatePct: true,
  status: true,
} as const;

export async function pharmacySettings(
  pharmacyId: string,
): Promise<PharmacySettings | null> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacy.findUnique({ where: { id: pharmacyId }, select: FIELDS }),
  );
}

export interface UpdateSettingsInput {
  pharmacyId: string;
  actorStaffId: string;
  displayName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  fdaLtoNumber: string | null;
  prcLicenseNo: string | null;
  vatRatePct: number;
}

export async function updatePharmacySettings(
  input: UpdateSettingsInput,
): Promise<PharmacySettings | null> {
  const { pharmacyId, actorStaffId, ...fields } = input;

  return systemDb(async (tx) => {
    const before = await tx.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: FIELDS,
    });
    if (!before) return null;

    const after = await tx.pharmacy.update({
      where: { id: pharmacyId },
      data: fields,
      select: FIELDS,
    });

    // The whole record either side, not a diff. Which field changed is easy to
    // work out later; what the TIN used to be is not, and that is the question
    // an audit actually asks.
    await tx.auditLog.create({
      data: {
        actorType: "merchant",
        actorStaffId,
        action: "pharmacy.settings.update",
        entityType: "pharmacy",
        entityId: pharmacyId,
        before,
        after,
      },
    });

    return after;
  });
}
