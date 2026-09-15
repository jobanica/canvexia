"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { parseCsv } from "@/lib/hq/csv";
import { requireHqAction } from "./auth";
import { TIER_FEE, TIERS, planImport } from "./territories";

export type TerritoryState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  | { status: "plan"; message: string; plan: ReturnType<typeof planImport> };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function saveTerritoryAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to edit territories." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const tier = String(formData.get("tier") ?? "").trim();
  const rawFee = String(formData.get("licenseFee") ?? "").trim().replace(/[,₱\s]/g, "");
  // "Yes, use the tier's default" — the brief asks for the prompt; this is the
  // answer coming back. Without it a tier change would silently keep a fee that
  // no longer matches what the tier is worth.
  const useTierFee = formData.get("useTierFee") === "on";

  if (!name) return { status: "error", message: "A territory needs a name." };
  if (!(TIERS as readonly string[]).includes(tier)) {
    return { status: "error", message: "Pick a tier." };
  }
  const fee = useTierFee ? (TIER_FEE[tier] ?? 0) : Number(rawFee);
  if (!Number.isFinite(fee) || fee < 0) {
    return { status: "error", message: "The licence fee is not a number." };
  }

  try {
    const message = await systemDb(async (tx) => {
      if (id) {
        const before = await tx.territory.findUnique({
          where: { id },
          select: { name: true, province: true, region: true, tier: true, licenseFee: true },
        });
        if (!before) throw new Error("GONE");
        await tx.territory.update({
          where: { id },
          data: { name, province, region, tier: tier as never, licenseFee: fee },
        });
        await writeHqAudit(tx, {
          actorEmail: actor.email,
          action: "territory.updated",
          entityType: "territory",
          entityId: id,
          before,
          after: { name, province, region, tier, licenseFee: fee },
        });
        return `${name} saved.`;
      }

      const slug = slugify(name);
      if (!SLUG_RE.test(slug)) throw new Error("SLUG");
      const clash = await tx.territory.findUnique({ where: { slug }, select: { id: true } });
      if (clash) throw new Error("EXISTS");

      const created = await tx.territory.create({
        data: {
          name,
          province,
          region,
          slug,
          tier: tier as never,
          licenseFee: fee,
          status: "available",
        },
        select: { id: true },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "territory.created",
        entityType: "territory",
        entityId: created.id,
        after: { name, province, region, tier, licenseFee: fee, slug },
      });
      return `${name} added.`;
    });

    revalidatePath("/hq/territories");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "GONE") return { status: "error", message: "That territory no longer exists." };
    if (why === "EXISTS") return { status: "error", message: "A territory with that name exists." };
    if (why === "SLUG") return { status: "error", message: "That name has no usable slug." };
    return { status: "error", message: "Could not save that territory." };
  }
}

/**
 * Assign a territory to a partner.
 *
 * FOUR WRITES OR NONE: the territory's status and holder, the partner's
 * `territoryId`, the open assignment row, and the audit. A territory marked
 * taken with no assignment row is a city nobody can explain the ownership of.
 *
 * The partial unique index on `territory_assignments` is what actually stops
 * two open assignments — this checks first so the error is a sentence rather
 * than a constraint violation, but the index is the guarantee.
 */
export async function assignTerritoryAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to assign territories." };
  }

  const territoryId = String(formData.get("territoryId") ?? "").trim();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  if (!territoryId || !partnerId) return { status: "error", message: "Pick a partner." };

  try {
    const message = await systemDb(async (tx) => {
      const t = await tx.territory.findUnique({
        where: { id: territoryId },
        select: { id: true, name: true, status: true, assignable: true, partnerId: true },
      });
      if (!t) throw new Error("GONE");
      // A split parent is not for sale: its districts are. Assigning it would
      // license the whole and the parts to different people.
      if (!t.assignable) throw new Error("SPLIT");
      if (t.partnerId) throw new Error("TAKEN");

      const p = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true },
      });
      if (!p) throw new Error("NO_PARTNER");

      const now = new Date();
      await tx.territory.update({
        where: { id: territoryId },
        data: { partnerId, status: "taken", assignedAt: now },
      });
      await tx.partner.update({
        where: { id: partnerId },
        data: { territoryId, territory: t.name },
      });
      await tx.territoryAssignment.create({
        data: { territoryId, partnerId, assignedAt: now, actorEmail: actor.email },
      });
      await writeHqAudit(tx, {
        partnerId,
        actorEmail: actor.email,
        action: "territory.assigned",
        entityType: "territory",
        entityId: territoryId,
        after: { territory: t.name, partner: p.name },
      });
      return `${t.name} is now ${p.name}'s.`;
    });

    revalidatePath("/hq/territories");
    revalidatePath("/hq/partners");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "SPLIT") {
      return { status: "error", message: "This territory was split. Assign its districts instead." };
    }
    if (why === "TAKEN") return { status: "error", message: "Somebody already holds that city." };
    if (why === "NO_PARTNER") return { status: "error", message: "That partner no longer exists." };
    if (why === "GONE") return { status: "error", message: "That territory no longer exists." };
    return { status: "error", message: "Could not assign that territory." };
  }
}

/** Release a territory: closes the assignment, puts the city back on the market. */
export async function releaseTerritoryAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to release territories." };
  }

  const territoryId = String(formData.get("territoryId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 4) {
    return { status: "error", message: "Say why. A territory taken back with no reason is the one that gets contested." };
  }

  try {
    const message = await systemDb(async (tx) => {
      const t = await tx.territory.findUnique({
        where: { id: territoryId },
        select: { id: true, name: true, partnerId: true },
      });
      if (!t || !t.partnerId) throw new Error("FREE");

      await tx.territoryAssignment.updateMany({
        where: { territoryId, releasedAt: null },
        data: { releasedAt: new Date(), reason, actorEmail: actor.email },
      });
      await tx.territory.update({
        where: { id: territoryId },
        data: { partnerId: null, status: "available", assignedAt: null },
      });
      // The partner's own pointer goes too. The free-text `territory` column
      // stays: it is what every older screen reads, and blanking it would make
      // a partner look unlicensed rather than released.
      await tx.partner.updateMany({
        where: { territoryId },
        data: { territoryId: null },
      });
      await writeHqAudit(tx, {
        partnerId: t.partnerId,
        actorEmail: actor.email,
        action: "territory.released",
        entityType: "territory",
        entityId: territoryId,
        reason,
        before: { partnerId: t.partnerId },
        after: { status: "available" },
      });
      return `${t.name} is available again.`;
    });

    revalidatePath("/hq/territories");
    revalidatePath("/hq/partners");
    return { status: "done", message };
  } catch (e) {
    if (e instanceof Error && e.message === "FREE") {
      return { status: "error", message: "Nobody holds that territory." };
    }
    return { status: "error", message: "Could not release that territory." };
  }
}

/**
 * Split a territory into districts.
 *
 * The parent becomes non-assignable rather than being deleted: it is referenced
 * by waitlist rows and by anyone who has ever seen its name, and deleting it
 * would orphan all of that. A parent holding a partner refuses — releasing it
 * first is a deliberate act with a reason attached, and folding that into a
 * split would hide it.
 */
export async function splitTerritoryAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to split territories." };
  }

  const parentId = String(formData.get("parentId") ?? "").trim();
  const names = String(formData.get("districts") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.length < 2) {
    return { status: "error", message: "Name at least two districts — one is a rename, not a split." };
  }

  try {
    const message = await systemDb(async (tx) => {
      const parent = await tx.territory.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          name: true,
          province: true,
          region: true,
          tier: true,
          licenseFee: true,
          partnerId: true,
        },
      });
      if (!parent) throw new Error("GONE");
      if (parent.partnerId) throw new Error("HELD");

      for (const name of names) {
        const slug = slugify(`${parent.name}-${name}`);
        const clash = await tx.territory.findUnique({ where: { slug }, select: { id: true } });
        if (clash) continue; // already split this way; make the re-run harmless
        await tx.territory.create({
          data: {
            name,
            province: parent.province,
            region: parent.region,
            slug,
            // Districts inherit the parent's tier and fee. A district of a
            // large city is not automatically a small territory, and guessing
            // downward would underprice it.
            tier: parent.tier,
            licenseFee: parent.licenseFee,
            status: "available",
            parentId: parent.id,
          },
        });
      }

      await tx.territory.update({
        where: { id: parentId },
        data: { assignable: false },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "territory.split",
        entityType: "territory",
        entityId: parentId,
        after: { districts: names },
      });
      return `${parent.name} split into ${names.length} districts. The parent is no longer for sale.`;
    });

    revalidatePath("/hq/territories");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "HELD") {
      return {
        status: "error",
        message: "Release this territory from its partner before splitting it.",
      };
    }
    if (why === "GONE") return { status: "error", message: "That territory no longer exists." };
    return { status: "error", message: "Could not split that territory." };
  }
}

/** Merge districts back: the parent becomes assignable, free children go. */
export async function mergeTerritoryAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to merge territories." };
  }

  const parentId = String(formData.get("parentId") ?? "").trim();

  try {
    const message = await systemDb(async (tx) => {
      const parent = await tx.territory.findUnique({
        where: { id: parentId },
        select: { id: true, name: true },
      });
      if (!parent) throw new Error("GONE");

      const children = await tx.territory.findMany({
        where: { parentId },
        select: { id: true, name: true, partnerId: true },
      });
      // A district somebody is licensed for cannot be merged away underneath
      // them. Release it first, with a reason, which is a decision somebody has
      // to make rather than a side effect of tidying the map.
      const held = children.filter((c) => c.partnerId);
      if (held.length > 0) throw new Error(`HELD:${held.map((c) => c.name).join(", ")}`);

      await tx.territory.deleteMany({ where: { parentId } });
      await tx.territory.update({ where: { id: parentId }, data: { assignable: true } });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "territory.merged",
        entityType: "territory",
        entityId: parentId,
        before: { districts: children.map((c) => c.name) },
        after: { assignable: true },
      });
      return `${parent.name} is one territory again.`;
    });

    revalidatePath("/hq/territories");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why.startsWith("HELD:")) {
      return {
        status: "error",
        message: `Release these first: ${why.slice(5)}.`,
      };
    }
    if (why === "GONE") return { status: "error", message: "That territory no longer exists." };
    return { status: "error", message: "Could not merge those territories." };
  }
}

/**
 * Import a CSV.
 *
 * TWO STEPS ON PURPOSE. `dryRun` returns a plan and writes nothing; only a
 * second submit with `apply` writes. An import that silently rewrote 143 rows
 * because a column was misspelled is not recoverable from a screen, and this is
 * the data that decides who owns a city.
 */
export async function importTerritoriesAction(
  _prev: TerritoryState,
  formData: FormData,
): Promise<TerritoryState> {
  let actor;
  try {
    actor = await requireHqAction("territories.write");
  } catch {
    return { status: "error", message: "You do not have permission to import territories." };
  }

  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!text.trim()) return { status: "error", message: "No CSV to read." };

  const { rows } = parseCsv(text);
  if (rows.length === 0) return { status: "error", message: "That file has a header and no rows." };

  const existing = await systemDb((tx) =>
    tx.territory.findMany({
      select: { slug: true, name: true, province: true, region: true, tier: true, licenseFee: true },
    }),
  );

  const plan = planImport(rows, existing);

  if (formData.get("apply") !== "yes") {
    return {
      status: "plan",
      plan,
      message: `${plan.create.length} to add, ${plan.update.length} to change, ${plan.untouched} untouched.`,
    };
  }

  if (plan.errors.length > 0) {
    return { status: "error", message: "Fix the errors in the file first." };
  }

  try {
    await systemDb(async (tx) => {
      for (const c of plan.create) {
        await tx.territory.create({
          data: {
            name: c.name,
            province: c.province,
            region: c.region,
            slug: c.slug,
            tier: c.tier as never,
            licenseFee: c.licenseFee,
            status: "available",
          },
        });
      }
      for (const u of plan.update) {
        await tx.territory.update({
          where: { slug: u.slug },
          data: u.changes as never,
        });
      }
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "territory.imported",
        entityType: "territory",
        after: { created: plan.create.length, updated: plan.update.length },
      });
    });

    revalidatePath("/hq/territories");
    return {
      status: "done",
      message: `Added ${plan.create.length}, changed ${plan.update.length}. Nothing was deleted.`,
    };
  } catch {
    return { status: "error", message: "The import failed. Nothing was changed." };
  }
}
