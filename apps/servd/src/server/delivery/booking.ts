"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { writeAudit } from "@/server/audit/log";
import { awardPointsForOrder } from "@/server/loyalty/loyalty";
import { ensureSettlementPayment } from "@/server/orders/settle-payment";
import { resolveProvider, type GeoPoint, type OrderDetails, type RiderStatus } from "@/server/delivery/provider";
import type { Prisma } from "@prisma/client";

/**
 * Booking actions for the merchant + cashier delivery views. They resolve the
 * tenant's configured provider, dispatch through the DeliveryProvider interface,
 * persist a DeliveryBooking, mirror the rider state onto order.deliveryStatus
 * (so the customer's live tracker + boards stay in sync), audit, and notify.
 */

export type DeliveryMode = "manual" | "deeplink" | "api";

export interface BookingView {
  orderId: string;
  provider: string;
  status: RiderStatus;
  fee: number | null;
  etaMinutes: number | null;
  riderName: string | null;
  riderPhone: string | null;
  trackingUrl: string | null;
  updatedAt: string;
}

export interface BookingResult {
  ok: boolean;
  error?: string;
  mode?: DeliveryMode;
  booking?: BookingView | null;
  deepLinkUrl?: string; // deeplink mode: open this in the provider app
  fallbackManual?: boolean; // suggest the manual fallback after a failure
}

const ROLES = ["cashier", "admin", "merchant"] as const;
const MANUAL_STATUSES: RiderStatus[] = ["assigned", "picked_up", "delivered", "cancelled"];

function view(b: {
  orderId: string;
  provider: string;
  status: string;
  fee: number | null;
  etaMinutes: number | null;
  riderName: string | null;
  riderPhone: string | null;
  trackingUrl: string | null;
  updatedAt: Date;
}): BookingView {
  return {
    orderId: b.orderId,
    provider: b.provider,
    status: b.status as RiderStatus,
    fee: b.fee,
    etaMinutes: b.etaMinutes,
    riderName: b.riderName,
    riderPhone: b.riderPhone,
    trackingUrl: b.trackingUrl,
    updatedAt: b.updatedAt.toISOString(),
  };
}

const VIEW_SELECT = {
  orderId: true,
  provider: true,
  status: true,
  fee: true,
  etaMinutes: true,
  riderName: true,
  riderPhone: true,
  trackingUrl: true,
  updatedAt: true,
} as const;

/** Restaurant pickup point: businessAddress + pinned coords, receipt fallback. */
async function buildPickup(restaurantId: string): Promise<GeoPoint> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({
        select: { name: true, businessAddress: true, latitude: true, longitude: true, printerConfig: true },
      }),
    );
    const receipt = (r?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;
    return {
      name: r?.name ?? "Restaurant",
      address: r?.businessAddress || receipt?.address || "",
      phone: receipt?.phone ?? null,
      lat: r?.latitude ?? null,
      lng: r?.longitude ?? null,
    };
  } catch {
    return { name: "Restaurant", address: "", phone: null, lat: null, lng: null };
  }
}

interface OrderForBooking {
  ref: string;
  total: number;
  itemCount: number;
  dropoff: GeoPoint;
}

async function loadOrder(restaurantId: string, orderId: string): Promise<OrderForBooking | null> {
  const o = await tenantDb(restaurantId, (tx) =>
    tx.order.findFirst({
      where: { id: orderId, orderType: "delivery" },
      select: {
        id: true,
        total: true,
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        customerLat: true,
        customerLng: true,
        items: { select: { quantity: true } },
      },
    }),
  );
  if (!o) return null;
  return {
    ref: o.id.slice(0, 8).toUpperCase(),
    total: o.total,
    itemCount: o.items.reduce((n, it) => n + it.quantity, 0),
    dropoff: {
      name: o.customerName ?? "Customer",
      address: o.customerAddress ?? "",
      phone: o.customerPhone ?? null,
      lat: o.customerLat ?? null,
      lng: o.customerLng ?? null,
    },
  };
}

/** Reflect rider status onto the order so the tracker + boards stay in sync. */
async function mirrorToOrder(tx: Prisma.TransactionClient, orderId: string, status: RiderStatus): Promise<boolean> {
  try {
    if (status === "picked_up") {
      await tx.order.updateMany({ where: { id: orderId }, data: { deliveryStatus: "out_for_delivery" } });
    } else if (status === "delivered") {
      await tx.order.updateMany({
        where: { id: orderId },
        data: { deliveryStatus: "delivered", status: "closed", paymentStatus: "paid", billRequested: false },
      });
      // Book the settlement so the sale reaches accounting + the shift report.
      await ensureSettlementPayment(tx, orderId);
      return true; // signal "delivered" so the caller can award points
    }
  } catch {
    /* deliveryStatus column may lag — booking status is still recorded */
  }
  return false;
}

async function currentBooking(restaurantId: string, orderId: string): Promise<BookingView | null> {
  try {
    const b = await tenantDb(restaurantId, (tx) =>
      tx.deliveryBooking.findFirst({ where: { orderId }, select: VIEW_SELECT }),
    );
    return b ? view(b) : null;
  } catch {
    return null; // delivery_bookings not migrated yet
  }
}

export interface Dropoff {
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

/** Booking (if any) + the tenant's mode + the customer dropoff — drives the UI. */
export async function getBooking(
  orderId: string,
): Promise<{ booking: BookingView | null; mode: DeliveryMode; dropoff: Dropoff | null }> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { booking: null, mode: "manual", dropoff: null };
  }
  const resolved = await resolveProvider(staff.restaurantId);
  const order = await loadOrder(staff.restaurantId, orderId).catch(() => null);
  const dropoff = order
    ? {
        address: order.dropoff.address || null,
        phone: order.dropoff.phone ?? null,
        lat: order.dropoff.lat ?? null,
        lng: order.dropoff.lng ?? null,
      }
    : null;
  return { booking: await currentBooking(staff.restaurantId, orderId), mode: resolved.mode, dropoff };
}

/** Book a rider through the tenant's configured provider. */
export async function bookRider(orderId: string): Promise<BookingResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;

  const order = await loadOrder(rid, orderId);
  if (!order) return { ok: false, error: "This isn't a delivery order." };

  const resolved = await resolveProvider(rid);
  if (!resolved.enabled) return { ok: false, error: "Delivery booking is turned off in settings.", mode: resolved.mode };

  const pickup = await buildPickup(rid);
  const details: OrderDetails = { orderId, ref: order.ref, total: order.total, itemCount: order.itemCount };
  const contact = { name: order.dropoff.name, phone: order.dropoff.phone ?? "" };

  let res;
  try {
    res = await resolved.provider.bookRider(pickup, order.dropoff, details, contact);
  } catch {
    return { ok: false, error: "The delivery provider didn't respond. Try again or book manually.", mode: resolved.mode, fallbackManual: true };
  }

  const failed = res.status === "failed";
  const deepLinkUrl =
    resolved.mode === "deeplink" ? resolved.provider.deepLinkUrl?.(pickup, order.dropoff, details) ?? undefined : undefined;

  try {
    await tenantDb(rid, async (tx) => {
      await upsertBooking(tx, rid, orderId, {
        provider: resolved.mode,
        providerKey: resolved.providerKey,
        bookingRef: res.bookingRef ?? null,
        status: res.status,
        fee: res.fee ?? null,
        etaMinutes: res.etaMinutes ?? null,
        riderName: res.riderName ?? null,
        riderPhone: res.riderPhone ?? null,
        trackingUrl: res.trackingUrl ?? deepLinkUrl ?? null,
        raw: res.raw,
      });
      await writeAudit(tx, rid, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: failed ? "delivery.booking_failed" : "delivery.booking_created",
        entityType: "delivery_booking",
        entityId: orderId,
        after: { provider: resolved.mode, status: res.status, bookingRef: res.bookingRef, fee: res.fee },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/delivery_bookings|relation|column/i.test(msg)) {
      return { ok: false, error: "Needs a quick database update. Run the delivery migration in Supabase.", mode: resolved.mode };
    }
    return { ok: false, error: "Couldn't save the booking. Try again.", mode: resolved.mode };
  }

  await notifyOrdersChanged(rid);
  const booking = await currentBooking(rid, orderId);
  if (failed) {
    return { ok: false, error: "No rider found / provider unavailable. Retry, or book manually.", mode: resolved.mode, booking, fallbackManual: true };
  }
  return { ok: true, mode: resolved.mode, booking, deepLinkUrl };
}

/** Force a manual booking (the always-works fallback after a failed API book). */
export async function bookManual(orderId: string): Promise<BookingResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;
  try {
    await tenantDb(rid, async (tx) => {
      await upsertBooking(tx, rid, orderId, { provider: "manual", status: "manual" });
      await writeAudit(tx, rid, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "delivery.booking_manual",
        entityType: "delivery_booking",
        entityId: orderId,
        after: { provider: "manual", status: "manual" },
      });
    });
  } catch {
    return { ok: false, error: "Couldn't save. Run the delivery migration if you haven't." };
  }
  await notifyOrdersChanged(rid);
  return { ok: true, mode: "manual", booking: await currentBooking(rid, orderId) };
}

/** Staff manually advance a manual/deep-link booking's rider status. */
export async function setManualStatus(orderId: string, status: RiderStatus): Promise<BookingResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  if (!MANUAL_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
  const rid = staff.restaurantId;

  let delivered = false;
  try {
    await tenantDb(rid, async (tx) => {
      await tx.deliveryBooking.updateMany({ where: { orderId }, data: { status } });
      delivered = await mirrorToOrder(tx, orderId, status);
      await writeAudit(tx, rid, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "delivery.status_changed",
        entityType: "delivery_booking",
        entityId: orderId,
        after: { status, manual: true },
      });
    });
  } catch {
    return { ok: false, error: "Couldn't update." };
  }

  if (delivered) {
    try {
      const o = await tenantDb(rid, (tx) =>
        tx.order.findFirst({ where: { id: orderId }, select: { total: true, customerPhone: true } }),
      );
      if (o) await awardPointsForOrder(rid, orderId, o.total, o.customerPhone);
    } catch {
      /* loyalty never blocks */
    }
  }
  await notifyOrdersChanged(rid);
  return { ok: true, booking: await currentBooking(rid, orderId) };
}

/** Pull the latest status from an API provider (manual refresh button). */
export async function refreshBookingStatus(orderId: string): Promise<BookingResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;
  const existing = await tenantDb(rid, (tx) =>
    tx.deliveryBooking.findFirst({ where: { orderId }, select: { provider: true, bookingRef: true } }),
  ).catch(() => null);
  if (!existing || existing.provider !== "api" || !existing.bookingRef) {
    return { ok: true, booking: await currentBooking(rid, orderId) };
  }

  const resolved = await resolveProvider(rid);
  const st = await resolved.provider.getStatus(existing.bookingRef);
  let delivered = false;
  await tenantDb(rid, async (tx) => {
    await tx.deliveryBooking.updateMany({
      where: { orderId },
      data: {
        status: st.status,
        riderName: st.riderName ?? undefined,
        riderPhone: st.riderPhone ?? undefined,
        riderLat: st.riderLat ?? undefined,
        riderLng: st.riderLng ?? undefined,
        trackingUrl: st.trackingUrl ?? undefined,
        etaMinutes: st.etaMinutes ?? undefined,
      },
    });
    delivered = await mirrorToOrder(tx, orderId, st.status);
  }).catch(() => {});
  if (delivered) {
    try {
      const o = await tenantDb(rid, (tx) => tx.order.findFirst({ where: { id: orderId }, select: { total: true, customerPhone: true } }));
      if (o) await awardPointsForOrder(rid, orderId, o.total, o.customerPhone);
    } catch {
      /* ignore */
    }
  }
  await notifyOrdersChanged(rid);
  return { ok: true, booking: await currentBooking(rid, orderId) };
}

/** Cancel a booking (calls the provider for API bookings). */
export async function cancelBooking(orderId: string): Promise<BookingResult> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;
  const existing = await tenantDb(rid, (tx) =>
    tx.deliveryBooking.findFirst({ where: { orderId }, select: { provider: true, bookingRef: true } }),
  ).catch(() => null);

  if (existing?.provider === "api" && existing.bookingRef) {
    const resolved = await resolveProvider(rid);
    try {
      await resolved.provider.cancelBooking(existing.bookingRef);
    } catch {
      /* best-effort */
    }
  }
  try {
    await tenantDb(rid, async (tx) => {
      await tx.deliveryBooking.updateMany({ where: { orderId }, data: { status: "cancelled" } });
      await writeAudit(tx, rid, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "delivery.booking_cancelled",
        entityType: "delivery_booking",
        entityId: orderId,
        after: { status: "cancelled" },
      });
    });
  } catch {
    return { ok: false, error: "Couldn't cancel." };
  }
  await notifyOrdersChanged(rid);
  return { ok: true, booking: await currentBooking(rid, orderId) };
}

/** Upsert by orderId (one booking per order; re-booking overwrites). */
async function upsertBooking(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  orderId: string,
  data: {
    provider: string;
    providerKey?: string | null;
    bookingRef?: string | null;
    status: RiderStatus;
    fee?: number | null;
    etaMinutes?: number | null;
    riderName?: string | null;
    riderPhone?: string | null;
    trackingUrl?: string | null;
    raw?: unknown;
  },
): Promise<void> {
  const common = {
    provider: data.provider,
    providerKey: data.providerKey ?? null,
    bookingRef: data.bookingRef ?? null,
    status: data.status,
    fee: data.fee ?? null,
    etaMinutes: data.etaMinutes ?? null,
    riderName: data.riderName ?? null,
    riderPhone: data.riderPhone ?? null,
    trackingUrl: data.trackingUrl ?? null,
    raw: (data.raw ?? undefined) as Prisma.InputJsonValue | undefined,
  };
  await tx.deliveryBooking.upsert({
    where: { orderId },
    create: { restaurantId, orderId, ...common },
    update: common,
  });
}
