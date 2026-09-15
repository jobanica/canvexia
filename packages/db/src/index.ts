/**
 * Runtime code shared by every app against this schema.
 *
 * Deliberately small. `packages/db` owns the Prisma schema and the policies, so
 * it is the only place a function that WRITES a merchant can live without one
 * app importing another — which is impossible across two Next processes, and is
 * why merchant creation was stuck in apps/resceta until D36.
 *
 * Anything here takes a `Prisma.TransactionClient` and never opens its own: the
 * client belongs to the app that owns the process.
 */
export {
  provisionPharmacyIn,
  uniquePharmacySlug,
  type ProvisionPharmacyInput,
  type ProvisionedPharmacy,
} from "./provisioning/pharmacy";
