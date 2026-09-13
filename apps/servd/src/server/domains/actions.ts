"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getCustomDomainAccess } from "@/server/billing/addons";
import { getDomainProvider } from "@/server/domains";
import { RESERVED_ADDRESSES } from "@/lib/restaurants/web-address";

export type FormState = { ok?: boolean; error?: string } | null;

/**
 * Custom domains need a PAID Growth/Business plan or the one-time ₱500 unlock —
 * a trial doesn't grant them. Enforced here so the gate can't be bypassed by
 * posting straight to the action.
 */
async function ensureModule(restaurantId: string) {
  const access = await getCustomDomainAccess(restaurantId);
  if (!access.allowed) {
    throw new Error("Custom domains are locked. Upgrade to Growth or buy the one-time unlock.");
  }
}

const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Use 3–40 letters, numbers or hyphens");

export async function setSubdomain(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const sub = subdomainSchema.parse(formData.get("subdomain"));
    // The shared list, not a shorter one written here. `tutorials` in
    // particular is intercepted by middleware before any restaurant lookup
    // happens, so a shop that claimed it would save successfully and then find
    // its site shadowed by the platform's tutorials hub with nothing to explain
    // why.
    if (RESERVED_ADDRESSES.includes(sub)) {
      return { error: "That subdomain is reserved." };
    }
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({ where: { id: restaurantId }, data: { subdomain: sub }, select: { id: true } }),
    );
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid subdomain" };
    // Unique-constraint or module error.
    const msg = e instanceof Error ? e.message : "Couldn't save subdomain";
    return { error: msg.includes("Unique") ? "That subdomain is taken." : msg };
  }
  revalidatePath("/admin/domains");
  return { ok: true };
}

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a valid domain like order.mybistro.com");

/**
 * Connect a domain, or swap the connected one for a different address.
 *
 * Changing was always possible — the form is prefilled and saving overwrites —
 * but the domain being replaced was left attached to the platform's Vercel
 * project forever. That is not cosmetic: an abandoned domain still routes
 * there, still holds a certificate, and blocks anybody (including this shop,
 * later) from connecting it again, because the provider refuses a domain
 * already claimed. So the old one is released as part of the swap.
 */
export async function connectCustomDomain(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const domain = domainSchema.parse(formData.get("domain"));
    const provider = getDomainProvider();
    if (!provider) return { error: "Domain connection isn't configured on the platform yet." };

    const before = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { customDomain: true } }),
    );
    if (before.customDomain === domain) {
      return { error: "That's already your connected domain." };
    }

    // Add the new one FIRST. If the provider rejects it, the shop is left on
    // the domain it already had and working, rather than on nothing.
    const res = await provider.addDomain(domain);
    if (!res.ok) return { error: res.error ?? "Vercel rejected the domain." };

    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { customDomain: domain, customDomainVerifiedAt: null },
        select: { id: true },
      }),
    );

    // Only now release the old address — the swap has already succeeded, so a
    // provider hiccup here costs a stale entry, not the shop's website.
    if (before.customDomain) {
      try {
        await provider.removeDomain(before.customDomain);
      } catch {
        /* left attached; harmless until somebody wants that domain back */
      }
    }
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid domain" };
    const msg = e instanceof Error ? e.message : "Couldn't connect domain";
    return { error: msg.includes("Unique") ? "That domain is already connected." : msg };
  }
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function refreshDomainStatus(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const provider = getDomainProvider();
  if (!provider) return;
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { customDomain: true } }),
  );
  if (!r.customDomain) return;
  const status = await provider.getStatus(r.customDomain);
  if (status?.verified) {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { customDomainVerifiedAt: new Date() },
        select: { id: true },
      }),
    );
  }
  revalidatePath("/admin/domains");
}

export async function removeCustomDomain(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const provider = getDomainProvider();
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { customDomain: true } }),
  );
  if (r.customDomain && provider) await provider.removeDomain(r.customDomain);
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: { customDomain: null, customDomainVerifiedAt: null },
      select: { id: true },
    }),
  );
  revalidatePath("/admin/domains");
}
