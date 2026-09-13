"use server";

import { revalidatePath } from "next/cache";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { checkWebAddress } from "@/lib/restaurants/web-address";

export type AddressState = { ok?: boolean; slug?: string; error?: string } | null;

/**
 * Change the shop's web address — the `/r/{slug}` in every link it has.
 *
 * Deliberately NOT gated behind the custom-domain unlock. Correcting a typo the
 * shop has been stuck with since signup is not a premium feature; charging ₱500
 * to fix "mango-gril" would be indefensible.
 *
 * The old address is kept on the row and the public lookup falls back to it, so
 * the QR codes already printed and stuck to the tables keep opening the right
 * menu. That fallback is the whole reason this is safe to offer at all — without
 * it, one form submission silently bricks every tent card in the building.
 */
export async function changeWebAddress(
  _prev: AddressState,
  formData: FormData,
): Promise<AddressState> {
  const { restaurantId } = await requireAdminAction();

  const current = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { slug: true } }),
  );

  const checked = checkWebAddress(formData.get("address"), current.slug);
  if (!checked.ok) return { error: checked.error };
  const slug = checked.slug;

  // Taken by another shop? Checked in the system context because slugs are
  // unique across the whole platform, not within one tenant — a tenant-scoped
  // read would find nothing and report every taken address as free.
  try {
    const clash = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { slug }, select: { id: true } }),
    );
    if (clash && clash.id !== restaurantId) {
      return { error: `"${slug}" is taken by another shop. Try adding your city or branch.` };
    }
  } catch {
    /* fall through — the unique constraint below is the real guard */
  }

  // Two writes, and the order matters. The slug is what everything depends on,
  // so it goes first and on its own: if the previousSlug column hasn't been
  // migrated yet, the owner still gets the address they asked for, and the only
  // thing lost is the redirect from the old one.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({ where: { id: restaurantId }, data: { slug }, select: { id: true } }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return {
      error: msg.includes("Unique")
        ? `"${slug}" is taken by another shop. Try adding your city or branch.`
        : "Couldn't change the address just now. Try again.",
    };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { previousSlug: current.slug },
        select: { id: true },
      }),
    );
  } catch {
    /* previousSlug not migrated (or already claimed) — old links just won't redirect */
  }

  // Every public surface that renders the address, plus the admin pages that
  // print it onto QR sheets.
  revalidatePath("/admin/domains");
  revalidatePath("/admin/storefront");
  revalidatePath("/admin/tables");
  revalidatePath("/r/[slug]", "page");
  revalidatePath("/order/[slug]/[tableToken]", "page");
  return { ok: true, slug };
}
