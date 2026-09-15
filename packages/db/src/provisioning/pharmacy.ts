import type { Prisma } from "@prisma/client";

/**
 * Create a pharmacy merchant owned by a partner, inside a caller's transaction.
 *
 * Lives here rather than in either app because BOTH need it: Resceta provisions
 * one when its own adapter is asked to, and the CANVEXIA partner portal — which
 * runs in apps/servd — provisions one when a partner signs a pharmacy up (D36).
 * Two copies of merchant creation drifting apart is precisely the failure that
 * decision exists to prevent, and the drift would be silent: a pharmacy created
 * down one path without a `partnerId` is invisible to its partner under RLS and
 * absent from every statement, with nothing raised to say so.
 *
 * Takes a transaction client rather than opening one. The caller decides the
 * scope — in practice each app's own `systemDb`, because this writes a row that
 * does not yet belong to any merchant scope: there is no pharmacy to scope to
 * until it returns. That is the one legitimate use of systemDb in this path,
 * and the `partnerId` written here is what makes every later query scopeable.
 *
 * Ownership is set in the statement that creates the row, never in a follow-up
 * update, for the same reason.
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
  /** Recorded on the audit row when a person did this through the portal. */
  actorEmail?: string;
}

export interface ProvisionedPharmacy {
  id: string;
  slug: string;
}

export async function provisionPharmacyIn(
  tx: Prisma.TransactionClient,
  input: ProvisionPharmacyInput,
): Promise<ProvisionedPharmacy> {
  const name = input.name.trim();
  if (!name) throw new Error("provisionPharmacy: a name is required");
  if (!input.partnerId) throw new Error("provisionPharmacy: a partnerId is required");

  const slug = await uniquePharmacySlug(tx, name);
  const pharmacy = await tx.pharmacy.create({
    data: {
      partnerId: input.partnerId,
      name,
      slug,
      // `pending` rather than `active`: a pharmacy cannot legally dispense
      // before its FDA Licence to Operate is on file, and defaulting to active
      // would put the platform in the position of having enabled it. The
      // partner switches it on from the portal once the licence is recorded
      // (D36) — which is the check that makes this default mean something.
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
      actorEmail: input.actorEmail ?? null,
      action: "pharmacy.provision",
      entityType: "pharmacy",
      entityId: pharmacy.id,
      after: { name, slug: pharmacy.slug, productId: "pharmacy", status: "pending" },
    },
  });

  return pharmacy;
}

/**
 * A URL-safe slug that is not already taken.
 *
 * Read back rather than assumed: uniqueness is this product's problem, not the
 * portal's, and the adapter contract requires returning the slug actually
 * assigned.
 */
export async function uniquePharmacySlug(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
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
  // is creating merchants in a loop. A random suffix beats failing a real
  // signup, but it should be visible in the data.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
