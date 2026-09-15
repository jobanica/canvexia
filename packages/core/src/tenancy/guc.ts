/**
 * The Postgres session settings that carry tenancy into the database.
 *
 * These names appear in three places that must agree exactly: the helper
 * functions in prisma/rls.sql, every policy that calls them, and the scoped-db
 * wrappers that set them. A typo in any one of them does not raise an error —
 * `current_setting(..., true)` returns NULL for a name nobody set, the policy
 * quietly matches no rows, and the symptom is an empty screen a long way from
 * the cause. So they are written down once, here, and imported.
 *
 * Shared rather than app-local because the second product onto this core will
 * need the same three, and two copies of a string that must match is the same
 * bug with more steps.
 */
export const GUC = {
  /** The Servd merchant the request is scoped to. Set by tenantDb(). */
  restaurantId: "app.current_restaurant_id",
  /** The Resceta merchant the request is scoped to. Set by pharmacyDb(). */
  pharmacyId: "app.current_pharmacy_id",
  /** The CANVEXIA partner the request is scoped to. Set by partnerDb(). */
  partnerId: "app.current_partner_id",
  /**
   * The partner SEAT the request is scoped to. Set by partnerDb() alongside
   * the partner id, and read only by the A7 staff tables.
   *
   * A second axis, not a replacement. Every policy that existed before A7 asks
   * one question — does this row belong to the partner in the GUC — and that
   * is the boundary that keeps Davao out of Tagum. The seven staff tables ask
   * a second one, because there the seat IS the boundary: a salesperson has no
   * business in a colleague's GPS trail. Nothing else consults this, and
   * widening the older policies to consult it would double the number of ways
   * the TENANT boundary can be got wrong.
   *
   * Empty string when the caller has no seat — a legacy partner login with no
   * partner_users row. Policies treat that as "no seat", which reads as empty
   * rather than as everybody's rows.
   */
  partnerUserId: "app.current_partner_user_id",
  /** Trusted system context. Set by systemDb(). Bypasses every tenant policy. */
  superAdmin: "app.is_super_admin",
} as const;

export type GucName = (typeof GUC)[keyof typeof GUC];

/** The value app.is_super_admin() tests for. Anything else reads as false. */
export const SUPER_ADMIN_ON = "on";
