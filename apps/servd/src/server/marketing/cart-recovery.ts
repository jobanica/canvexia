"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { notifyCustomer } from "@/server/sms/notify";
import { restaurantSiteUrl } from "@/lib/qr";

/**
 * Abandoned-cart recovery for online ordering. A lead is captured when a diner
 * enters their phone at checkout; if they don't place the order, a cron sends a
 * one-off recovery SMS. Server-authoritative, tenant-scoped, all best-effort.
 */

const RECOVER_AFTER_MS = 30 * 60 * 1000; // wait 30 min of inactivity
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // …but don't chase day-old carts

function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, "");
}

const captureSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(7).max(30),
  itemCount: z.coerce.number().int().min(0).max(999).default(0),
  total: z.coerce.number().int().min(0).max(100_000_000).default(0),
});

/** Capture / refresh an open cart lead as the diner fills in the checkout. */
export async function captureCartLead(input: {
  slug: string;
  name?: string;
  phone: string;
  itemCount?: number;
  total?: number;
}): Promise<{ ok: boolean }> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 7) return { ok: false };

  try {
    const restaurant = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { slug: parsed.data.slug, status: "active" }, select: { id: true } }),
    );
    if (!restaurant) return { ok: false };

    await tenantDb(restaurant.id, async (tx) => {
      const existing = await tx.cartLead.findFirst({
        where: { customerPhone: phone, status: "open" },
        select: { id: true },
      });
      if (existing) {
        await tx.cartLead.update({
          where: { id: existing.id },
          data: { itemCount: parsed.data.itemCount, total: parsed.data.total, customerName: parsed.data.name || null },
        });
      } else {
        await tx.cartLead.create({
          data: {
            restaurantId: restaurant.id,
            customerPhone: phone,
            customerName: parsed.data.name || null,
            itemCount: parsed.data.itemCount,
            total: parsed.data.total,
          },
        });
      }
    });
    return { ok: true };
  } catch {
    return { ok: false }; // table not migrated / transient — never block checkout
  }
}

/** Mark a phone's open lead converted once their order is actually placed. */
export async function markCartConverted(restaurantId: string, phone: string): Promise<void> {
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.cartLead.updateMany({
        where: { customerPhone: normalized, status: "open" },
        data: { status: "converted" },
      }),
    );
  } catch {
    /* best-effort */
  }
}

export interface RecoverySummary {
  recovered: number;
}

/**
 * Cron: SMS diners who left an online cart 30+ min ago without ordering, once.
 * Cross-tenant read in the trusted system context; each message is scoped to
 * one restaurant's own lead.
 */
export async function runCartRecovery(now: Date = new Date()): Promise<RecoverySummary> {
  let recovered = 0;
  let leads: { id: string; restaurantId: string; customerName: string | null; customerPhone: string; slug: string; name: string }[] = [];
  try {
    const rows = await systemDb((tx) =>
      tx.cartLead.findMany({
        where: {
          status: "open",
          updatedAt: { lt: new Date(now.getTime() - RECOVER_AFTER_MS), gt: new Date(now.getTime() - MAX_AGE_MS) },
        },
        select: {
          id: true,
          restaurantId: true,
          customerName: true,
          customerPhone: true,
          restaurant: { select: { slug: true, displayName: true, name: true } },
        },
        take: 500,
      }),
    );
    leads = rows.map((r) => ({
      id: r.id,
      restaurantId: r.restaurantId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      slug: r.restaurant.slug,
      name: r.restaurant.displayName || r.restaurant.name,
    }));
  } catch {
    return { recovered: 0 }; // not migrated yet
  }

  for (const lead of leads) {
    const hi = lead.customerName ? `Hi ${lead.customerName}, ` : "Hi, ";
    const msg = `${hi}you left items in your cart at ${lead.name}. Finish your order: ${restaurantSiteUrl(lead.slug)}`;
    await notifyCustomer(lead.restaurantId, lead.customerPhone, msg); // best-effort
    try {
      await tenantDb(lead.restaurantId, (tx) =>
        tx.cartLead.updateMany({
          where: { id: lead.id, status: "open" },
          data: { status: "recovered", recoveredAt: now },
        }),
      );
      recovered++;
    } catch {
      /* ignore */
    }
  }
  return { recovered };
}
