"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getBooking,
  bookRider,
  bookManual,
  setManualStatus,
  refreshBookingStatus,
  cancelBooking,
  type BookingView,
  type DeliveryMode,
  type Dropoff,
} from "@/server/delivery/booking";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  searching: { label: "Finding a rider…", cls: "bg-mango/15 text-mango" },
  assigned: { label: "Rider assigned", cls: "bg-blue-100 text-blue-700" },
  picked_up: { label: "Picked up — on the way", cls: "bg-indigo-100 text-indigo-700" },
  delivered: { label: "Delivered ✓", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", cls: "bg-plum-ink/10 text-plum-ink/50" },
  failed: { label: "Booking failed", cls: "bg-guava/15 text-guava" },
  manual: { label: "Booked (manual)", cls: "bg-brand-primary/10 text-brand-primary" },
};

function bookLabel(mode: DeliveryMode): string {
  if (mode === "deeplink") return "📍 Book rider (opens app)";
  if (mode === "api") return "📍 Book rider";
  return "📍 Book rider (manual)";
}

/**
 * Self-contained rider-booking panel for one delivery order. Drops into both the
 * cashier delivery board and the merchant screen. It fetches its own booking
 * (and the tenant's provider mode), books via the configured provider, shows
 * live status + rider info, and exposes manual status controls / retry +
 * manual fallback on failure. `pulse` re-fetches when the parent board refreshes.
 */
function CopyCoords({ dropoff }: { dropoff: Dropoff }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const coords = dropoff.lat != null && dropoff.lng != null ? `${dropoff.lat},${dropoff.lng}` : null;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* ignore */
    }
  }
  const lbl = (key: string, base: string) => (copiedKey === key ? "Copied ✓" : base);

  if (!coords && !dropoff.address && !dropoff.phone) return null;
  const btn = "rounded-lg border border-plum-ink/15 bg-white px-3 py-1.5 font-semibold";
  return (
    <div className="mt-2 rounded-xl bg-cream px-3 py-2 text-xs">
      <p className="font-semibold text-plum-ink/60">Customer location (copy into your delivery app)</p>
      {dropoff.address && <p className="mt-1 text-plum-ink/80">📍 {dropoff.address}</p>}
      {dropoff.phone && <p className="mt-0.5 text-plum-ink/80">📞 {dropoff.phone}</p>}
      {coords && <p className="mt-1 font-mono text-sm font-semibold text-plum-ink">{coords}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {coords && (
          <button onClick={() => copy("coords", coords)} className={btn}>
            {lbl("coords", "Copy coordinates")}
          </button>
        )}
        {dropoff.address && (
          <button onClick={() => copy("address", dropoff.address!)} className={btn}>
            {lbl("address", "Copy address")}
          </button>
        )}
        {dropoff.phone && (
          <button onClick={() => copy("phone", dropoff.phone!)} className={btn}>
            {lbl("phone", "Copy phone number")}
          </button>
        )}
        {coords && (
          <a href={`https://maps.google.com/?q=${coords}`} target="_blank" rel="noopener noreferrer" className={btn}>
            Google Maps
          </a>
        )}
      </div>
    </div>
  );
}

export function DeliveryRiderPanel({ orderId, pulse = 0 }: { orderId: string; pulse?: number }) {
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [mode, setMode] = useState<DeliveryMode>("manual");
  const [dropoff, setDropoff] = useState<Dropoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  const load = useCallback(async () => {
    const res = await getBooking(orderId);
    setBooking(res.booking);
    setMode(res.mode);
    setDropoff(res.dropoff);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load, pulse]);

  /**
   * Ask the provider where things stand, while a delivery is actually running.
   *
   * Callbacks are the fast path, but they are somebody else's network: a
   * signature that stops matching, a deploy, an outage, and the board sits on
   * "Finding a rider…" while the food is halfway across town. Polling every
   * twenty seconds costs one request per live delivery and means the panel
   * repairs itself — including picking up the tracking URL, which is what the
   * Track rider link needs.
   *
   * Only for API bookings, and only until the delivery is over: a manual
   * booking has nobody to ask, and a delivered one has nothing left to say.
   */
  const live =
    mode === "api" &&
    (booking?.status === "searching" || booking?.status === "assigned" || booking?.status === "picked_up");

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      void refreshBookingStatus(orderId)
        .then((res) => { if (res.booking !== undefined) setBooking(res.booking ?? null); })
        .catch(() => { /* transient — the next tick tries again */ });
    }, 20_000);
    return () => clearInterval(id);
  }, [live, orderId]);

  async function onBook() {
    setBusy(true);
    setError(null);
    setFallback(false);
    const res = await bookRider(orderId);
    if (res.booking !== undefined) setBooking(res.booking ?? null);
    if (res.mode) setMode(res.mode);
    if (res.deepLinkUrl) window.open(res.deepLinkUrl, "_blank", "noopener");
    if (!res.ok) {
      setError(res.error ?? "Couldn't book.");
      setFallback(!!res.fallbackManual);
    }
    setBusy(false);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; booking?: BookingView | null }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    if (res.booking !== undefined) setBooking(res.booking ?? null);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    setBusy(false);
  }

  // No booking yet → coordinates to copy + a single Book button.
  if (!booking || booking.status === "cancelled") {
    return (
      <div className="mt-2">
        {dropoff && <CopyCoords dropoff={dropoff} />}
        <button
          onClick={onBook}
          disabled={busy}
          className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Booking…" : bookLabel(mode)}
        </button>
        {booking?.status === "cancelled" && (
          <p className="mt-1 text-center text-xs text-plum-ink/40">Previous booking cancelled.</p>
        )}
        {error && <p className="mt-1 text-center text-xs font-semibold text-guava">{error}</p>}
        {fallback && (
          <button
            onClick={() => run(() => bookManual(orderId))}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-plum-ink/15 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Book manually instead
          </button>
        )}
      </div>
    );
  }

  const meta = STATUS_META[booking.status] ?? STATUS_META.manual;
  const isManual = booking.provider !== "api"; // manual + deeplink use hand controls
  const terminal = booking.status === "delivered";

  return (
    <div className="mt-2 rounded-xl border border-plum-ink/10 bg-plum-ink/[0.02] p-3">
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
        <div className="flex items-center gap-2 text-xs text-plum-ink/50">
          {booking.etaMinutes != null && <span>~{booking.etaMinutes}m</span>}
          {booking.fee != null && booking.fee > 0 && <span>₱{(booking.fee / 100).toFixed(0)}</span>}
        </div>
      </div>

      {(booking.riderName || booking.riderPhone) && (
        <p className="mt-2 text-sm">
          🏍️ <span className="font-semibold">{booking.riderName ?? "Rider"}</span>
          {booking.riderPhone && (
            <a href={`tel:${booking.riderPhone}`} className="ml-2 text-brand-primary underline">
              {booking.riderPhone}
            </a>
          )}
        </p>
      )}

      {booking.trackingUrl && (
        <a
          href={booking.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-blue-600 underline"
        >
          {isManual ? "Open in provider app ↗" : "Track rider ↗"}
        </a>
      )}

      {/* Customer coordinates to copy into the delivery app (esp. for manual). */}
      {!terminal && dropoff && <CopyCoords dropoff={dropoff} />}

      {error && <p className="mt-2 text-xs font-semibold text-guava">{error}</p>}

      {!terminal && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isManual ? (
            <>
              {booking.status !== "assigned" && booking.status !== "picked_up" && (
                <button onClick={() => run(() => setManualStatus(orderId, "assigned"))} disabled={busy} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Rider assigned
                </button>
              )}
              {booking.status !== "picked_up" && (
                <button onClick={() => run(() => setManualStatus(orderId, "picked_up"))} disabled={busy} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Picked up
                </button>
              )}
              <button onClick={() => run(() => setManualStatus(orderId, "delivered"))} disabled={busy} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                Mark delivered
              </button>
            </>
          ) : (
            <button onClick={() => run(() => refreshBookingStatus(orderId))} disabled={busy} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-xs font-semibold disabled:opacity-50">
              ↻ Refresh status
            </button>
          )}
          <button onClick={() => run(() => cancelBooking(orderId))} disabled={busy} className="rounded-lg px-3 py-2 text-xs font-semibold text-guava disabled:opacity-50">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
