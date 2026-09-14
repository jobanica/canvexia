import "server-only";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Create a pharmacy merchant owned by a partner.
 *
 * Runs as the system because it writes a row that does not yet belong to any
 * merchant scope — there is no pharmacy to scope to until this returns. That is
 * the one legitimate use of systemDb in this path, and the `partnerId` written
 * here is what makes every subsequent query scopeable.
 *
 * Ownership is set HERE, in the one statement that creates the row, and not in
 * a follow-up update. A pharmacy created without a partner is invisible to its
 * partner under RLS and absent from every statement, and nothing errors to say
 * so — the failure is silent, which is why it is not allowed to be two steps.
 */

export interface ProvisionPharmacyInput {
  partnerId: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  tagline?: string;
  /** FDA Licence to Operate, if known at signup. Chased later otherwise. */
  fdaLtoNumber?: string;
  prcLicenseNo?: string;
  tin?: string;
}

export interface ProvisionedPharmacy {
  id: string;
  slug: string;
}

export async function provisionPharmacy(
  input: ProvisionPharmacyInput,
): Promise<ProvisionedPharmacy> {
  const name = input.name.trim();
  if (!name) throw new Error("provisionPharmacy: a name is required");
  if (!input.partnerId) throw new Error("provisionPharmacy: a partnerId is required");

  return systemDb(async (tx) => {
    const slug = await uniqueSlug(tx, name);
    const pharmacy = await tx.pharmacy.create({
      data: {
        partnerId: input.partnerId,
        name,
        slug,
        // `pending` rather than `active`: a pharmacy cannot legally dispense
        // before its FDA Licence to Operate is on file, and defaulting to
        // active would put the platform in the position of having enabled it.
        status: "pending",
        displayName: name,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        logoUrl: input.logoUrl ?? null,
        tagline: input.tagline ?? null,
        fdaLtoNumber: input.fdaLtoNumber ?? null,
        prcLicenseNo: input.prcLicenseNo ?? null,
        tin: input.tin ?? null,
      },
      select: { id: true, slug: true },
    });

    await tx.auditLog.create({
      data: {
        partnerId: input.partnerId,
        actorType: "partner",
        action: "pharmacy.provision",
        entityType: "pharmacy",
        entityId: pharmacy.id,
        after: { name, slug: pharmacy.slug, productId: "pharmacy" },
      },
    });

    return pharmacy;
  });
}

/**
 * A URL-safe slug that is not already taken.
 *
 * Read back rather than assumed: uniqueness is this product's problem, not the
 * portal's, and the adapter contract requires returning the slug that was
 * actually assigned.
 */
async function uniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pharmacy";

  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const taken = await tx.pharmacy.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // 50 collisions on one name is not a naming problem, it is a sign something
  // is creating merchants in a loop. A random suffix is better than failing a
  // real signup, but it should be visible in the data.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
