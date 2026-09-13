import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDate, manilaDateTime } from "@/lib/time/manila";

/**
 * The customer book — every person who has ordered (pickup/delivery save their
 * name + phone) or joined rewards. We merge loyalty accounts with order history
 * (by phone) so the admin can see points AND spend in one place, export it, and
 * the cashier can add walk-ins by hand.
 *
 * All reads go through systemDb with an explicit restaurantId so they keep
 * working even if the loyalty tables' tenant RLS policy is missing on prod.
 */

export interface CustomerRow {
  phone: string;
  name: string | null;
  points: number;
  totalEarned: number;
  orders: number;
  totalSpent: number; // centavos (paid orders)
  lastOrderAt: string | null;
  address: string | null; // last known delivery address
  joinedAt: string | null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

/** Full customer list for the admin book + CSV export. */
export async function getCustomers(restaurantId: string): Promise<CustomerRow[]> {
  const byPhone = new Map<string, CustomerRow>();

  const ensure = (phone: string): CustomerRow => {
    const existing = byPhone.get(phone);
    if (existing) return existing;
    const row: CustomerRow = {
      phone,
      name: null,
      points: 0,
      totalEarned: 0,
      orders: 0,
      totalSpent: 0,
      lastOrderAt: null,
      address: null,
      joinedAt: null,
    };
    byPhone.set(phone, row);
    return row;
  };

  // 1) Loyalty accounts (points + name + joined date).
  try {
    const accounts = await systemDb((tx) =>
      tx.loyaltyAccount.findMany({
        where: { restaurantId },
        select: { phone: true, points: true, totalEarned: true, createdAt: true },
      }),
    );
    for (const a of accounts) {
      const row = ensure(a.phone);
      row.points = a.points;
      row.totalEarned = a.totalEarned;
      row.joinedAt = a.createdAt.toISOString();
    }
    // Names are best-effort (column may lag on prod).
    try {
      const named = await systemDb((tx) =>
        tx.loyaltyAccount.findMany({ where: { restaurantId }, select: { phone: true, name: true } }),
      );
      for (const n of named) if (n.name) ensure(n.phone).name = n.name;
    } catch {
      /* name column not migrated yet */
    }
  } catch {
    /* loyalty table unavailable */
  }

  // 2) Order history (spend + last order + address). Best-effort: the customer
  // columns may lag on prod.
  try {
    const orders = await systemDb((tx) =>
      tx.order.findMany({
        where: { restaurantId, customerPhone: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          customerPhone: true,
          customerName: true,
          customerAddress: true,
          total: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
    );
    for (const o of orders) {
      const phone = normalizePhone(o.customerPhone ?? "");
      if (!phone) continue;
      const row = ensure(phone);
      row.orders += 1;
      if (o.paymentStatus === "paid") row.totalSpent += o.total;
      const at = o.createdAt.toISOString();
      if (!row.lastOrderAt || at > row.lastOrderAt) row.lastOrderAt = at;
      if (!row.name && o.customerName) row.name = o.customerName;
      if (!row.address && o.customerAddress) row.address = o.customerAddress;
    }
  } catch {
    /* customer columns not migrated yet */
  }

  return Array.from(byPhone.values()).sort((a, b) => {
    const aDate = a.lastOrderAt ?? a.joinedAt ?? "";
    const bDate = b.lastOrderAt ?? b.joinedAt ?? "";
    return bDate.localeCompare(aDate);
  });
}

/** CSV (with header row) of the whole customer book — for download/export. */
export async function customersCsv(restaurantId: string): Promise<string> {
  const rows = await getCustomers(restaurantId);
  const header = [
    "Name",
    "Phone",
    "Points",
    "Total earned",
    "Orders",
    "Total spent (PHP)",
    "Last order",
    "Address",
    "Joined",
  ];
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.name),
        esc(r.phone),
        r.points,
        r.totalEarned,
        r.orders,
        (r.totalSpent / 100).toFixed(2),
        esc(r.lastOrderAt ? manilaDateTime(r.lastOrderAt) : ""),
        esc(r.address),
        esc(r.joinedAt ? manilaDate(r.joinedAt) : ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}
