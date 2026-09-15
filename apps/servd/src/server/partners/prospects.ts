import "server-only";
import { PRODUCTS, type ProductId } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import type { ProspectInputValues, Stage } from "@/lib/partners/prospect-input";

/**
 * The pipeline, partner-scoped.
 *
 * Reads and writes go through partnerDb, so the policy is what scopes them: a
 * prospect id belonging to another partner updates ZERO rows rather than
 * theirs. The isolation suite asserts exactly that, including the insert case —
 * a policy with only USING lets a tenant write rows it cannot read back.
 *
 * Audit rows are written in the SAME transaction as the change. A stage move
 * that is not attributable to a person is the one outcome this must not
 * produce, and it cannot depend on a second call happening.
 */
export interface ProspectRow {
  id: string;
  businessName: string;
  ownerName: string | null;
  mobile: string | null;
  address: string | null;
  productId: string;
  productName: string;
  stage: Stage;
  source: string;
  nextFollowUpAt: Date | null;
  notes: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  convertedMerchantId: string | null;
  createdAt: Date;
}

function productName(id: string): string {
  return (PRODUCTS as Record<string, { name: string }>)[id]?.name ?? id;
}

export async function listProspects(partnerId: string): Promise<ProspectRow[]> {
  const rows = await partnerDb(partnerId, (tx) =>
    tx.prospect.findMany({
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        mobile: true,
        address: true,
        productId: true,
        stage: true,
        source: true,
        nextFollowUpAt: true,
        notes: true,
        assignedToId: true,
        convertedMerchantId: true,
        createdAt: true,
        assignedTo: { select: { name: true, email: true } },
      },
    }),
  );

  return rows.map((r) => ({
    ...r,
    stage: r.stage as Stage,
    productName: productName(r.productId),
    assignedToName: r.assignedTo?.name ?? r.assignedTo?.email ?? null,
  }));
}

/** The seats a prospect can be assigned to. Deactivated seats are not offered. */
export async function listAssignableSeats(partnerId: string) {
  return partnerDb(partnerId, (tx) =>
    tx.partnerUser.findMany({
      where: { status: "active" },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ).catch(() => []);
}

type Actor = { partnerId: string; email: string };

export async function createProspect(
  actor: Actor,
  input: ProspectInputValues,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const id = await partnerDb(actor.partnerId, async (tx) => {
      const row = await tx.prospect.create({
        data: {
          partnerId: actor.partnerId,
          businessName: input.businessName,
          ownerName: input.ownerName,
          mobile: input.mobile,
          address: input.address,
          productId: input.productId,
          source: input.source,
          nextFollowUpAt: input.nextFollowUpAt,
          notes: input.notes,
          assignedToId: input.assignedToId,
        },
        select: { id: true, businessName: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "prospect.create",
          entityType: "prospect",
          entityId: row.id,
          after: { businessName: row.businessName, stage: "lead", productId: input.productId },
        },
      });
      return row.id;
    });
    return { ok: true, id };
  } catch {
    return { ok: false, message: "Could not save that. Try again." };
  }
}

/**
 * Move a prospect between stages.
 *
 * `updateMany` rather than `update`: an id belonging to another partner matches
 * zero rows under the policy, and `update` would throw a Prisma "record not
 * found" that reads like a bug. A count of 0 is the honest answer and the
 * caller reports "not found" — probing ids should not be a directory.
 */
export async function moveProspect(
  actor: Actor,
  prospectId: string,
  stage: Stage,
  lostReason?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await partnerDb(actor.partnerId, async (tx) => {
      const before = await tx.prospect.findUnique({
        where: { id: prospectId },
        select: { stage: true, businessName: true },
      });
      if (!before) return { ok: false, message: "That prospect no longer exists." };
      if (before.stage === stage) return { ok: true };

      const updated = await tx.prospect.updateMany({
        where: { id: prospectId },
        data: {
          stage,
          lostReason: stage === "lost" ? (lostReason?.trim() || null) : null,
          updatedAt: new Date(),
        },
      });
      if (updated.count === 0) return { ok: false, message: "That prospect no longer exists." };

      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "prospect.stage",
          entityType: "prospect",
          entityId: prospectId,
          reason: stage === "lost" ? (lostReason?.trim() || null) : null,
          before: { stage: before.stage },
          after: { stage },
        },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, message: "Could not move that. Try again." };
  }
}

/**
 * Link a prospect to the merchant it became.
 *
 * Two columns, because a merchant id is unique only WITHIN a product. Called
 * after provisioning succeeds; failing to link is not allowed to fail the
 * provision, because the merchant already exists by then and rolling it back
 * would be worse than an unlinked prospect.
 */
export async function linkProspectToMerchant(
  actor: Actor,
  prospectId: string,
  productId: ProductId,
  merchantId: string,
): Promise<void> {
  try {
    await partnerDb(actor.partnerId, async (tx) => {
      const updated = await tx.prospect.updateMany({
        where: { id: prospectId },
        data: {
          convertedMerchantId: merchantId,
          convertedProductId: productId,
          convertedAt: new Date(),
          stage: "trial",
          updatedAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "prospect.convert",
          entityType: "prospect",
          entityId: prospectId,
          after: { productId, merchantId, stage: "trial" },
        },
      });
    });
  } catch {
    /* the merchant exists; an unlinked prospect is the lesser problem */
  }
}

/** One prospect, for prefilling the create-merchant form. */
export async function getProspect(partnerId: string, id: string): Promise<ProspectRow | null> {
  const rows = await listProspects(partnerId);
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * Resolve a public lead-form slug to the partner that owns it.
 *
 * systemDb, because nobody is signed in — this is the lookup that decides WHOSE
 * pipeline a stranger's row lands in, so it returns the minimum needed to brand
 * the page and nothing else. An unapproved or suspended partner resolves to
 * null: a lead form is a promise to follow up, and a partner who cannot trade
 * should not be collecting numbers.
 */
export async function partnerBySlug(slug: string) {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > 64) return null;
  try {
    return await systemDb((tx) =>
      tx.partner.findFirst({
        where: { slug: clean, status: "approved" },
        select: { id: true, name: true, slug: true, brandConfig: true },
      }),
    );
  } catch {
    return null;
  }
}
