import "server-only";
import { provisionPharmacyIn, type ProvisionPharmacyInput, type ProvisionedPharmacy } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Create a pharmacy merchant owned by a partner.
 *
 * The logic is in `@servd/db` because the CANVEXIA partner portal needs the
 * same function and runs in a different process (D36). This wrapper supplies
 * Resceta's own system scope and nothing else — the row it writes belongs to no
 * merchant scope yet, because there is no pharmacy to scope to until it exists.
 */
export type { ProvisionPharmacyInput, ProvisionedPharmacy };

export async function provisionPharmacy(
  input: ProvisionPharmacyInput,
): Promise<ProvisionedPharmacy> {
  return systemDb((tx) => provisionPharmacyIn(tx, input));
}
