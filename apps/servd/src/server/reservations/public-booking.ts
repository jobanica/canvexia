"use server";

import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicStorefront } from "@/server/storefront/storefront";
import { hasFeature } from "@/server/billing/feature-gate";
import { isValidPhone } from "@/lib/phone";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { sendBookingPush } from "@/server/push/send";

/**
 * Customer-facing "Book a table" flow. Diners have no session, so this runs in
 * the trusted system context but re-validates everything server-side: the plan
 * must include reservations, the restaurant must have bookings switched on, and
 * the chosen slot must be in the future and inside that weekday's opening hours.
 * A successful booking lands in Reservations (status "booked", source "online").
 */

export type BookingResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  customerName: z.string().trim().min(1, "Please enter your name.").max(80),
  customerPhone: z
    .string()
    .trim()
    .refine(isValidPhone, "Enter an 11-digit phone number (e.g. 09171234567)."),
  partySize: z.coerce.number().int().min(1, "How many people?").max(50, "For big groups, please call us."),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, "Pick a time."),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type BookingInput = z.input<typeof schema>;

/** Minutes since midnight for "HH:MM". */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function createPublicBooking(input: BookingInput): Promise<BookingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  const v = parsed.data;

  const restaurant = await getPublicRestaurantBySlug(v.slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  // Plan must include reservations AND the owner must have bookings turned on.
  const [reservationsOn, sf] = await Promise.all([
    hasFeature(restaurant.id, "reservations"),
    getPublicStorefront(restaurant.id),
  ]);
  if (!reservationsOn || !sf.acceptsBookings) {
    return { ok: false, error: "Online booking isn't available for this restaurant." };
  }

  // Philippine local time is a fixed UTC+8 (no DST) — parse the picked slot with
  // that offset so it's stored as the correct instant regardless of server TZ.
  const reservedAt = new Date(`${v.date}T${v.time}:00+08:00`);
  if (Number.isNaN(reservedAt.getTime())) return { ok: false, error: "That date & time didn't look right." };

  // Must be in the future (a little lead time so it's actionable).
  if (reservedAt.getTime() < Date.now() + 15 * 60 * 1000) {
    return { ok: false, error: "Please pick a time at least 15 minutes from now." };
  }
  // Not absurdly far out.
  if (reservedAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: "Bookings can only be made up to 90 days ahead." };
  }

  // Validate against that weekday's opening hours (index 0=Sun … 6=Sat, PH time).
  const phParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(reservedAt);
  const wdName = phParts.find((p) => p.type === "weekday")?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  const day = sf.hours[dow];
  if (!day || day.closed) return { ok: false, error: "We're closed that day — please pick another." };
  const slotMin = toMinutes(v.time);
  const openMin = toMinutes(day.open);
  const closeMin = toMinutes(day.close);
  const withinHours = closeMin <= openMin
    ? slotMin >= openMin || slotMin < closeMin // past-midnight close (e.g. 18:00–02:00)
    : slotMin >= openMin && slotMin <= closeMin;
  if (!withinHours) {
    return { ok: false, error: "That time is outside our opening hours — please pick another." };
  }

  // Basic flood guard: cap identical-phone future bookings so the form can't be
  // hammered into hundreds of rows. Best-effort; never blocks a genuine booking.
  try {
    const existing = await systemDb((tx) =>
      tx.reservation.count({
        where: {
          restaurantId: restaurant.id,
          customerPhone: v.customerPhone,
          status: "booked",
          reservedAt: { gte: new Date() },
        },
      }),
    );
    if (existing >= 5) return { ok: false, error: "You already have several upcoming bookings. Please call us to add more." };
  } catch { /* count is best-effort */ }

  try {
    await systemDb((tx) =>
      tx.reservation.create({
        data: {
          restaurantId: restaurant.id,
          customerName: v.customerName,
          customerPhone: v.customerPhone,
          partySize: v.partySize,
          reservedAt,
          status: "booked",
          note: v.note || null,
        },
        select: { id: true },
      }),
    );
  } catch {
    return { ok: false, error: "We couldn't save your booking just now. Please try again in a moment." };
  }

  // Tag it as a self-service online booking (separate write — the `source`
  // column ships in a later migration and must not fail the booking itself).
  try {
    await systemDb((tx) =>
      tx.reservation.updateMany({
        where: { restaurantId: restaurant.id, customerPhone: v.customerPhone, reservedAt, source: null },
        data: { source: "online" },
      }),
    );
  } catch { /* source column not migrated yet */ }

  // Tell the merchant devices. Without this a self-booked reservation lands
  // silently and staff only find it if they happen to open Reservations.
  try {
    await notifyOrdersChanged(restaurant.id);
    await sendBookingPush(restaurant.id, {
      customerName: v.customerName,
      partySize: v.partySize,
      reservedAt,
    });
  } catch { /* alerting must never fail the booking */ }

  return { ok: true };
}
