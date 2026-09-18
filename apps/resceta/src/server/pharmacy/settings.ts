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

  /** What the receipt says and what it is printed on. */
  receiptPaperMm: number;
  autoPrintReceipt: boolean;
  receiptHeader: string | null;
  receiptFooter: string | null;
  birPermitNo: string | null;
  posSerialNo: string | null;

  /** The loyalty programme. Both zero means it is off. */
  loyaltyPointsPerPeso: number;
  loyaltyCentavosPerPoint: number;

  /** The public shop page. Off until somebody turns it on. */
  storefrontOn: boolean;
  storefrontBlurb: string | null;
  storefrontAcceptsDelivery: boolean;
  slug: string;
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
  receiptPaperMm: true,
  autoPrintReceipt: true,
  receiptHeader: true,
  receiptFooter: true,
  birPermitNo: true,
  posSerialNo: true,
  loyaltyPointsPerPeso: true,
  loyaltyCentavosPerPoint: true,
  storefrontOn: true,
  storefrontBlurb: true,
  storefrontAcceptsDelivery: true,
  slug: true,
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

  /**
   * EVERY FIELD BELOW IS OPTIONAL, and that is the contract rather than
   * laziness: a caller that does not send one must not blank it. A settings
   * form that covers the statutory identity and nothing else would otherwise
   * switch the loyalty programme off and close the storefront every time
   * somebody corrected a TIN.
   */
  receiptPaperMm?: number;
  autoPrintReceipt?: boolean;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  birPermitNo?: string | null;
  posSerialNo?: string | null;

  loyaltyPointsPerPeso?: number;
  loyaltyCentavosPerPoint?: number;

  storefrontOn?: boolean;
  storefrontBlurb?: string | null;
  storefrontAcceptsDelivery?: boolean;
}

export async function updatePharmacySettings(
  input: UpdateSettingsInput,
): Promise<PharmacySettings | null> {
  const { pharmacyId, actorStaffId, ...rest } = input;
  // Drop anything the caller left out, so Prisma does not write undefined as
  // null over a value somebody set on another screen.
  const fields = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );

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
