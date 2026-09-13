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
  /** The merchant the request is scoped to. Set by tenantDb(). */
  restaurantId: "app.current_restaurant_id",
  /** The CANVEXIA partner the request is scoped to. Set by partnerDb(). */
  partnerId: "app.current_partner_id",
  /** Trusted system context. Set by systemDb(). Bypasses every tenant policy. */
  superAdmin: "app.is_super_admin",
} as const;

export type GucName = (typeof GUC)[keyof typeof GUC];

/** The value app.is_super_admin() tests for. Anything else reads as false. */
export const SUPER_ADMIN_ON = "on";
