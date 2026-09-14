/**
 * What each role at a pharmacy may do.
 *
 * Four roles, from `PharmacyStaffRole`: owner, manager, pharmacist, cashier.
 *
 * ONE OF THESE IS NOT A PREFERENCE. Under PH pharmacy practice a
 * prescription-only medicine is dispensed by, or under the direct supervision
 * of, a registered pharmacist — so `dispenseRx` belongs to `pharmacist` and
 * `owner`, and a cashier alone cannot complete a sale containing an Rx item.
 * The others are ordinary access control and can be argued about; that one
 * cannot be loosened without someone deciding to break the law.
 *
 * Owner is NOT "every permission" written out longhand — it is a superset by
 * construction below, because a permission added later must not silently skip
 * the owner.
 *
 * Pure and dependency-free so the gates can be tested exhaustively without a
 * session, a database or a browser.
 */

export const PHARMACY_ROLES = ["owner", "manager", "pharmacist", "cashier"] as const;
export type PharmacyRole = (typeof PHARMACY_ROLES)[number];

export const PERMISSIONS = [
  /** Ring up a sale at the counter. */
  "sell",
  /** Complete a sale containing a prescription-only item. Statutory. */
  "dispenseRx",
  /** Void a completed sale. */
  "voidSale",
  /** Receive deliveries, adjust stock, write off expiry. */
  "manageStock",
  /** Add and price products, edit the catalogue. */
  "manageCatalogue",
  /** See margin, cost and the sales history beyond today. */
  "viewReports",
  /** Add, remove and re-role staff. */
  "manageStaff",
  /** Edit the pharmacy's own record — licences, TIN, VAT rate. */
  "manageSettings",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Granted permissions per role, owner excluded — see below.
 *
 * A cashier can sell and nothing else. That is the point of the role: it is the
 * one handed to the person who is at the counter on a Saturday, and every
 * permission it does not have is one that cannot be exercised by whoever is
 * standing at an unlocked till.
 */
const GRANTS: Record<Exclude<PharmacyRole, "owner">, readonly Permission[]> = {
  manager: [
    "sell",
    "voidSale",
    "manageStock",
    "manageCatalogue",
    "viewReports",
    "manageStaff",
  ],
  // A pharmacist dispenses and runs the stock; they do not hire or set prices.
  pharmacist: ["sell", "dispenseRx", "manageStock", "viewReports"],
  cashier: ["sell"],
};

export function can(role: PharmacyRole, permission: Permission): boolean {
  // Owner is a superset by construction. Writing owner's list out longhand is
  // how a permission added in six months quietly excludes the person who owns
  // the business.
  if (role === "owner") return true;

  // An unknown role grants nothing, rather than throwing.
  //
  // TypeScript makes this look unreachable, and it is not: `role` arrives from
  // a database column. A value added to the Postgres enum in a migration
  // before the code knows about it — or any bad row — would otherwise crash
  // `GRANTS[role].includes`, and because this is called during render that is
  // a 500 on every page rather than a denied permission. Failing closed and
  // quietly is the behaviour that degrades instead of breaking.
  const grants = GRANTS[role as Exclude<PharmacyRole, "owner">];
  return grants ? grants.includes(permission) : false;
}

export function permissionsOf(role: PharmacyRole): Permission[] {
  return PERMISSIONS.filter((p) => can(role, p));
}

export function isPharmacyRole(value: string): value is PharmacyRole {
  return (PHARMACY_ROLES as readonly string[]).includes(value);
}

/**
 * Whether this person may complete this particular cart.
 *
 * Separate from `can(role, "sell")` because the answer depends on what is IN
 * the cart, and the caller that knows that is the sale path. Returning a reason
 * rather than a boolean so the counter can say what to do about it — a cashier
 * who cannot dispense needs a pharmacist, not an error.
 */
export type SaleAuthorisation =
  | { ok: true }
  | { ok: false; reason: "cannot_sell" | "needs_pharmacist"; message: string };

export function authoriseSale(
  role: PharmacyRole,
  cart: { requiresPrescription: boolean }[],
): SaleAuthorisation {
  if (!can(role, "sell")) {
    return {
      ok: false,
      reason: "cannot_sell",
      message: "This account cannot ring up sales.",
    };
  }
  const hasRx = cart.some((item) => item.requiresPrescription);
  if (hasRx && !can(role, "dispenseRx")) {
    return {
      ok: false,
      reason: "needs_pharmacist",
      message:
        "This cart contains a prescription-only item. A pharmacist has to complete it.",
    };
  }
  return { ok: true };
}

/** Human label for the role, for the UI. */
export const ROLE_LABEL: Record<PharmacyRole, string> = {
  owner: "Owner",
  manager: "Manager",
  pharmacist: "Pharmacist",
  cashier: "Cashier",
};
