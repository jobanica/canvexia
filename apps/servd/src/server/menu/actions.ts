"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { writeAudit } from "@/server/audit/log";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { uploadMenuVideo } from "@/server/storage/menu-videos";
import { setDailyLimit } from "@/server/menu/servings";
import { setItemVariants } from "@/server/menu/variants";
import { pesosToCentavos } from "@/lib/money";
import { sanitizeTags } from "@/lib/menu/dietary";
import {
  categorySchema,
  menuItemSchema,
  modifierGroupSchema,
  modifierSchema,
} from "@/lib/validation/menu";

/** Shape returned to forms via useActionState. */
export type FormState = { ok?: boolean; error?: string } | null;

/** Turn a ZodError into a single friendly message for the form. */
function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

async function refresh() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin/modifiers");
}

// ---------------------------------------------------------------- categories

export async function createCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  await tenantDb(restaurantId, (tx) =>
    tx.category.create({ data: { restaurantId, ...parsed.data } }),
  );
  await refresh();
  return { ok: true };
}

export async function renameCategory(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await tenantDb(restaurantId, (tx) =>
    tx.category.update({ where: { id }, data: { name } }),
  );
  await refresh();
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  // Cascade removes the category's items (see schema onDelete: Cascade).
  await tenantDb(restaurantId, (tx) =>
    tx.category.delete({ where: { id } }),
  );
  await refresh();
}

// --------------------------------------------------------------------- items

async function resolveImageUrl(
  restaurantId: string,
  formData: FormData,
): Promise<string | undefined> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    return uploadMenuImage(restaurantId, file);
  }
  return undefined;
}

/**
 * Resolves the video change from the form:
 *   removeVideo → null · uploaded file → upload · pasted URL → that URL · else no change.
 * A returned {} means "leave the existing video untouched".
 */
async function resolveVideoUpdate(
  restaurantId: string,
  formData: FormData,
): Promise<{ videoUrl?: string | null }> {
  if (formData.get("removeVideo") === "on") return { videoUrl: null };

  const file = formData.get("video");
  if (file instanceof File && file.size > 0) {
    return { videoUrl: await uploadMenuVideo(restaurantId, file) };
  }
  const url = String(formData.get("videoUrl") ?? "").trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Video URL must start with http(s)://");
    return { videoUrl: url };
  }
  return {};
}

export async function createItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = menuItemSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricePesos: formData.get("pricePesos"),
    isAvailable: formData.get("isAvailable") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let imageUrl: string | undefined;
  try {
    imageUrl = await resolveImageUrl(restaurantId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed" };
  }

  const created = await tenantDb(restaurantId, (tx) =>
    tx.menuItem.create({
      data: {
        restaurantId,
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: pesosToCentavos(parsed.data.pricePesos),
        isAvailable: parsed.data.isAvailable,
        dietaryTags: sanitizeTags(formData.getAll("dietaryTags").map(String)),
        imageUrl,
      },
      select: { id: true },
    }),
  );
  await savePosOnly(restaurantId, created.id, formData);
  const costError = await saveFoodCost(restaurantId, created.id, formData.get("costPesos"));
  await refresh();
  return costError ? { error: costError } : { ok: true };
}

const bundleSchema = z.object({
  categoryId: z.string().min(1, "Pick a category"),
  name: z.string().trim().min(1, "Name your bundle").max(120),
  pricePesos: z.coerce.number().min(0, "Price?"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * A bundle's selection sections — e.g. "Main dishes: pick 4" and
 * "Side dishes / Desserts: pick 2". Each becomes a required modifier group, so
 * the storefront enforces every group's count independently.
 */
const bundleSectionsSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(60),
      choose: z.coerce.number().int().min(1).max(20),
      dishes: z.array(z.string().trim().min(1).max(120)).max(80),
    }),
  )
  .min(1)
  .max(6);

/**
 * Creates a "pick N for a fixed price" bundle (e.g. a bilao: 3 dishes for
 * ₱3,499). Built entirely from existing primitives — a menu item at the bundle
 * price plus a required "Choose N" modifier group whose options are the dishes
 * at ₱0 — so it flows through the normal storefront + server-validated order
 * pipeline with no special-casing.
 */
export async function createBundle(_prev: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = bundleSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    pricePesos: formData.get("pricePesos"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;

  // Sections arrive as JSON (each: label + choose + dishes). Backward-compatible
  // fallback: the old single "Choose N" shape (chooseCount + dishName[]).
  let sections: { label: string; choose: number; dishes: string[] }[];
  const rawSections = formData.get("sections");
  if (typeof rawSections === "string" && rawSections.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(rawSections);
    } catch {
      return { error: "Couldn't read the bundle sections." };
    }
    const p = bundleSectionsSchema.safeParse(json);
    if (!p.success) return { error: "Please complete each bundle section (a name and how many to pick)." };
    sections = p.data.map((s) => ({ ...s, dishes: s.dishes.map((d) => d.trim()).filter(Boolean) }));
  } else {
    const choose = Math.max(1, Math.min(20, Math.round(Number(formData.get("chooseCount")) || 3)));
    const dishes = formData.getAll("dishName").map((d) => String(d).trim()).filter(Boolean).slice(0, 80);
    sections = [{ label: `Choose ${choose}`, choose, dishes }];
  }

  // Every section needs at least as many choices as it asks the customer to pick.
  for (const s of sections) {
    if (s.dishes.length < s.choose) {
      return { error: `"${s.label}" needs at least ${s.choose} choice(s).` };
    }
  }

  let imageUrl: string | undefined;
  try {
    imageUrl = await resolveImageUrl(restaurantId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed" };
  }

  try {
    await tenantDb(restaurantId, async (tx) => {
      const item = await tx.menuItem.create({
        data: {
          restaurantId,
          categoryId: v.categoryId,
          name: v.name,
          description: v.description || null,
          price: pesosToCentavos(v.pricePesos),
          isAvailable: true,
          imageUrl,
        },
        select: { id: true },
      });
      // One required modifier group per section (e.g. "Main dishes — choose 4",
      // "Side dishes / Desserts — choose 2"). The storefront enforces each count.
      for (let gi = 0; gi < sections.length; gi++) {
        const s = sections[gi];
        const group = await tx.modifierGroup.create({
          data: { restaurantId, name: `${s.label} — choose ${s.choose}`, required: true, minSelect: s.choose, maxSelect: s.choose },
          select: { id: true },
        });
        await tx.modifier.createMany({
          data: s.dishes.map((name, i) => ({ modifierGroupId: group.id, name, priceDelta: 0, sortOrder: i })),
        });
        await tx.menuItemModifierGroup.create({
          data: { menuItemId: item.id, modifierGroupId: group.id, sortOrder: gi },
          select: { menuItemId: true },
        });
      }
    });
  } catch {
    return { error: "Couldn't create the bundle. Please try again." };
  }
  await refresh();
  return { ok: true };
}

export async function updateItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId, staffUserId, email } = await requireManagerAction();
  const id = String(formData.get("id"));
  const parsed = menuItemSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricePesos: formData.get("pricePesos"),
    isAvailable: formData.get("isAvailable") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let imageUrl: string | undefined;
  let videoUpdate: { videoUrl?: string | null } = {};
  try {
    imageUrl = await resolveImageUrl(restaurantId, formData);
    videoUpdate = await resolveVideoUpdate(restaurantId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }

  const price = pesosToCentavos(parsed.data.pricePesos);
  await tenantDb(restaurantId, async (tx) => {
    // Read first, in the same transaction, so the audit row records what the
    // item actually was rather than what the form happened to be showing.
    const before = await tx.menuItem.findUnique({
      where: { id },
      select: { name: true, price: true, isAvailable: true },
    });

    await tx.menuItem.update({
      where: { id },
      data: {
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price,
        isAvailable: parsed.data.isAvailable,
        dietaryTags: sanitizeTags(formData.getAll("dietaryTags").map(String)),
        // Only overwrite the image when a new one was uploaded.
        ...(imageUrl ? { imageUrl } : {}),
        ...videoUpdate,
      },
    });

    // Only when something worth answering for actually moved. Logging every
    // save would bury the price changes under description tweaks and photo
    // uploads, and an audit log nobody can read is one nobody checks.
    const changed =
      !before ||
      before.price !== price ||
      before.name !== parsed.data.name ||
      before.isAvailable !== parsed.data.isAvailable;
    if (changed) {
      await writeAudit(tx, restaurantId, {
        actorStaffId: staffUserId,
        actorEmail: email,
        action: before && before.price !== price ? "menu.price_changed" : "menu.item_updated",
        entityType: "menu_item",
        entityId: id,
        before: before ?? undefined,
        after: { name: parsed.data.name, price, isAvailable: parsed.data.isAvailable },
      });
    }
  });
  await savePosOnly(restaurantId, id, formData);
  const costError = await saveFoodCost(restaurantId, id, formData.get("costPesos"));
  const limitError = await saveDailyLimit(restaurantId, id, formData.get("dailyLimit"));
  await refresh();
  revalidatePath(`/admin/menu/${id}`);
  // The item itself saved; only the cost didn't. Say so rather than reporting
  // a clean save the owner can see is wrong.
  return costError || limitError ? { error: costError ?? limitError! } : { ok: true };
}

/**
 * Persist a menu item's daily servings cap from the form. A blank/zero value
 * clears the cap (unlimited). The field is absent on some forms (null) → leave
 * the existing setting untouched. Best-effort.
 */
/**
 * Counter-only, written on its own and best-effort.
 *
 * It ships as a hand-run migration (prisma/manual/add-pos-only-and-surcharge.sql),
 * so writing it inline with the rest of the item would mean a database that
 * hasn't run the file yet can't save a menu item at all. Failing quietly here
 * costs one checkbox; failing loudly costs the whole menu editor.
 */
async function savePosOnly(
  restaurantId: string,
  menuItemId: string,
  formData: FormData,
): Promise<void> {
  // An unchecked checkbox submits nothing, so a hidden marker distinguishes
  // "the form offered this and it's off" from "this form has no such field" —
  // otherwise every save from a form without the checkbox would clear it.
  if (!formData.has("posOnlyField")) return;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.menuItem.updateMany({
        where: { id: menuItemId },
        data: { posOnly: formData.get("posOnly") === "on" },
      }),
    );
  } catch {
    /* posOnly column not migrated yet */
  }
}

async function saveDailyLimit(
  restaurantId: string,
  menuItemId: string,
  raw: FormDataEntryValue | null,
): Promise<string | null> {
  if (raw == null) return null; // field not on this form → don't touch
  const s = String(raw).trim();
  const n = s === "" ? 0 : Math.floor(Number(s));
  const limit = Number.isFinite(n) && n > 0 ? n : null; // 0 / blank / invalid → no cap
  return setDailyLimit(restaurantId, menuItemId, limit);
}

/**
 * Upsert a menu item's food cost (for accounting COGS).
 *
 * Returns an error string instead of swallowing one. This used to catch and
 * discard every failure, so when the write was refused — the menu_item_costs
 * table has RLS forced on it, and a database that never got the matching
 * GRANT denies every insert — the owner typed a cost, pressed Save, and
 * watched it come back as 0.00 with nothing to explain why. A silent catch on
 * a write is silent data loss.
 */
async function saveFoodCost(
  restaurantId: string,
  menuItemId: string,
  raw: FormDataEntryValue | null,
): Promise<string | null> {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return "Food cost must be a number.";
  const cost = pesosToCentavos(n);
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.menuItemCost.upsert({
        where: { menuItemId },
        create: { restaurantId, menuItemId, cost },
        update: { cost },
      }),
    );
    return null;
  } catch (e) {
    console.error("saveFoodCost failed", e);
    return "Everything else saved, but the food cost couldn't be. Run prisma/manual/fix-table-grants.sql, then try again.";
  }
}

/**
 * Save an item's sizes/variants (name + price rows). Replaces the full list.
 * Submitted as parallel arrays: variantName[] + variantPrice[] (pesos).
 */
export async function saveItemVariants(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  const names = formData.getAll("variantName").map(String);
  const prices = formData.getAll("variantPrice").map(String);
  const stocks = formData.getAll("variantStock").map(String);
  const list = names.map((name, i) => {
    const s = (stocks[i] ?? "").trim();
    return {
      name,
      price: pesosToCentavos(Number(prices[i]) || 0),
      stock: s === "" ? null : Math.max(0, Math.floor(Number(s) || 0)), // blank = unlimited
    };
  });
  await setItemVariants(restaurantId, id, list);
  await refresh();
  revalidatePath(`/admin/menu/${id}`);
}

/** Out-of-stock toggle, used straight from the menu list. */
export async function toggleItemAvailability(formData: FormData): Promise<void> {
  const { restaurantId, staffUserId, email } = await requireManagerAction();
  const id = String(formData.get("id"));
  const available = formData.get("available") === "true";
  await tenantDb(restaurantId, async (tx) => {
    const item = await tx.menuItem.update({
      where: { id },
      data: { isAvailable: available },
      select: { name: true },
    });
    // Marking a seller unavailable takes it off the menu mid-service, so it's
    // worth a line saying who did it.
    await writeAudit(tx, restaurantId, {
      actorStaffId: staffUserId,
      actorEmail: email,
      action: available ? "menu.item_available" : "menu.item_unavailable",
      entityType: "menu_item",
      entityId: id,
      after: { name: item.name, isAvailable: available },
    });
  });
  await refresh();
}

export async function deleteItem(formData: FormData): Promise<void> {
  const { restaurantId, staffUserId, email } = await requireManagerAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, async (tx) => {
    // Snapshot before it's gone — after the delete there is nothing left to
    // describe what was removed, which is exactly what you want to know.
    const before = await tx.menuItem.findUnique({
      where: { id },
      select: { name: true, price: true },
    });
    await tx.menuItem.delete({ where: { id } });
    await writeAudit(tx, restaurantId, {
      actorStaffId: staffUserId,
      actorEmail: email,
      action: "menu.item_deleted",
      entityType: "menu_item",
      entityId: id,
      before: before ?? undefined,
    });
  });
  await refresh();
}

// --------------------------------------------------------- reordering

const orderIds = z.array(z.string().uuid()).max(500);

/** Persist a new category order (sortOrder = position). Tenant-scoped. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const ids = orderIds.parse(orderedIds);
  await tenantDb(restaurantId, async (tx) => {
    // updateMany scoped by id + restaurantId so a foreign id just matches nothing.
    await Promise.all(
      ids.map((id, i) => tx.category.updateMany({ where: { id, restaurantId }, data: { sortOrder: i } })),
    );
  });
  await refresh();
}

/**
 * Persist a new modifier-group order (sortOrder = position).
 *
 * This IS the order every menu item asks its questions in — it isn't set per
 * item. Arranging it once here is the whole point: before, the order came off
 * the item↔group link, which nothing wrote, so each item ended up with
 * whatever sequence the database felt like returning.
 */
export async function reorderModifierGroups(orderedIds: string[]): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const ids = orderIds.parse(orderedIds);
  try {
    await tenantDb(restaurantId, (tx) =>
      Promise.all(
        ids.map((id, i) =>
          tx.modifierGroup.updateMany({ where: { id, restaurantId }, data: { sortOrder: i } }),
        ),
      ),
    );
  } catch {
    /* sortOrder not migrated yet — see prisma/manual/add-modifier-group-order.sql */
  }
  await refresh();
}

/** Persist a new item order within one category (sortOrder = position). */
export async function reorderItems(categoryId: string, orderedIds: string[]): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const ids = orderIds.parse(orderedIds);
  await tenantDb(restaurantId, async (tx) => {
    const cat = await tx.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } });
    if (!cat) throw new Error("Category not found");
    // Scope to categoryId so items can only be reordered within their own category.
    await Promise.all(
      ids.map((id, i) => tx.menuItem.updateMany({ where: { id, categoryId }, data: { sortOrder: i } })),
    );
  });
  await refresh();
}

// --------------------------------------------------------- modifier groups

export async function createModifierGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = modifierGroupSchema.safeParse({
    name: formData.get("name"),
    required: formData.get("required") === "on",
    minSelect: formData.get("minSelect") ?? 0,
    maxSelect: formData.get("maxSelect") ?? 1,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  await tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.create({ data: { restaurantId, ...parsed.data } }),
  );
  await refresh();
  return { ok: true };
}

export async function updateModifierGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  const parsed = modifierGroupSchema.safeParse({
    name: formData.get("name"),
    required: formData.get("required") === "on",
    minSelect: formData.get("minSelect") ?? 0,
    maxSelect: formData.get("maxSelect") ?? 1,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const res = await tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.updateMany({ where: { id }, data: parsed.data }),
  );
  if (res.count === 0) return { error: "Modifier group not found." };
  await refresh();
  return { ok: true };
}

export async function deleteModifierGroup(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.delete({ where: { id } }),
  );
  await refresh();
}

export async function createModifier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const groupId = String(formData.get("modifierGroupId"));
  const parsed = modifierSchema.safeParse({
    name: formData.get("name"),
    priceDeltaPesos: formData.get("priceDeltaPesos") ?? 0,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  // Verify the group belongs to this tenant before adding an option to it.
  await tenantDb(restaurantId, async (tx) => {
    const group = await tx.modifierGroup.findFirst({ where: { id: groupId } });
    if (!group) throw new Error("Modifier group not found");
    await tx.modifier.create({
      data: {
        modifierGroupId: groupId,
        name: parsed.data.name,
        priceDelta: pesosToCentavos(parsed.data.priceDeltaPesos),
      },
    });
  });
  await refresh();
  return { ok: true };
}

export async function updateModifier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  const parsed = modifierSchema.safeParse({
    name: formData.get("name"),
    priceDeltaPesos: formData.get("priceDeltaPesos") ?? 0,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  // updateMany (scoped by id) so RLS via modifiers->modifier_groups blocks any
  // cross-tenant edit; a wrong id simply matches no rows.
  const res = await tenantDb(restaurantId, (tx) =>
    tx.modifier.updateMany({
      where: { id },
      data: { name: parsed.data.name, priceDelta: pesosToCentavos(parsed.data.priceDeltaPesos) },
    }),
  );
  if (res.count === 0) return { error: "Modifier not found." };
  await refresh();
  return { ok: true };
}

/**
 * Mark an add-on out / back in ("86 it") without deleting it. The option keeps
 * its place in the group; diners see it disabled and the server refuses to
 * accept it on an order while it's out.
 */
export async function setModifierAvailability(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  const isAvailable = formData.get("isAvailable") === "on";
  try {
    // updateMany (scoped by id) so RLS blocks any cross-tenant edit.
    await tenantDb(restaurantId, (tx) =>
      tx.modifier.updateMany({ where: { id }, data: { isAvailable } }),
    );
  } catch {
    // `isAvailable` column not migrated yet — nothing to toggle.
  }
  await refresh();
}

export async function deleteModifier(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id"));
  // RLS via the modifiers->modifier_groups policy ensures cross-tenant deletes fail.
  await tenantDb(restaurantId, (tx) =>
    tx.modifier.delete({ where: { id } }),
  );
  await refresh();
}

// ------------------------------------------------ attach groups to an item

export async function setItemModifierGroup(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const menuItemId = String(formData.get("menuItemId"));
  const modifierGroupId = String(formData.get("modifierGroupId"));
  const attach = formData.get("attach") === "true";

  await tenantDb(restaurantId, async (tx) => {
    // Confirm both rows belong to this tenant (RLS already enforces it, but we
    // fail clearly rather than silently no-op).
    const item = await tx.menuItem.findFirst({ where: { id: menuItemId } });
    const group = await tx.modifierGroup.findFirst({
      where: { id: modifierGroupId },
    });
    if (!item || !group) throw new Error("Not found");

    if (attach) {
      await tx.menuItemModifierGroup.upsert({
        where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } },
        update: {},
        create: { menuItemId, modifierGroupId },
      });
    } else {
      await tx.menuItemModifierGroup.delete({
        where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } },
      });
    }
  });
  revalidatePath(`/admin/menu/${menuItemId}`);
}
