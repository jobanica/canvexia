"use client";

import { useActionState, useEffect, useState } from "react";
import { updateStorefront, type StorefrontState } from "@/server/storefront/actions";
import { LocationPicker } from "@/components/site/LocationPicker";
import { SubmitButton } from "./SubmitButton";
import { wrapsMidnight } from "@/lib/site/store-hours";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}


/**
 * One day's hours.
 *
 * The "closes next day" note is the point of this being its own component: an
 * owner typing 10:00 – 02:30 has no way to tell whether the app read that as a
 * session running past midnight or as nonsense, and getting it wrong shuts the
 * shop at 2 AM. Now the row says which reading it took, as you type.
 */
function HoursRow({
  label,
  index,
  initial,
}: {
  label: string;
  index: number;
  initial?: DayHours;
}) {
  const [open, setOpen] = useState(initial?.open ?? "09:00");
  const [close, setClose] = useState(initial?.close ?? "21:00");
  const [closed, setClosed] = useState(!!initial?.closed);
  const overnight = !closed && wrapsMidnight({ open, close, closed });

  return (
    <div className="rounded-lg border border-plum-ink/10 p-3 sm:border-0 sm:p-0">
      <div className="sm:flex sm:items-center sm:gap-3">
        {/* Day + Closed toggle */}
        <div className="flex items-center justify-between sm:contents">
          <span className="text-sm font-semibold text-plum-ink/70 sm:w-10">{label}</span>
          <label className="flex items-center gap-1.5 text-sm text-plum-ink/60 sm:order-last">
            <input
              type="checkbox"
              name={`closed_${index}`}
              checked={closed}
              onChange={(e) => setClosed(e.target.checked)}
            />{" "}
            Closed
          </label>
        </div>
        {/* Open – Close (full-width on phones) */}
        <div className="mt-2 flex items-center gap-2 sm:mt-0">
          <input
            type="time"
            name={`open_${index}`}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm sm:flex-none"
          />
          <span className="shrink-0 text-plum-ink/40">–</span>
          <input
            type="time"
            name={`close_${index}`}
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm sm:flex-none"
          />
        </div>
      </div>
      {overnight && (
        <p className="mt-1 text-xs font-semibold text-brand-primary sm:ml-[3.25rem]">
          Closes next day — this session runs from {open} {label} through to {close}.
        </p>
      )}
    </div>
  );
}

/**
 * One manual online-payment method (GCash / Maya / Bank): a toggle plus account
 * name, number and an uploadable QR. Field names are prefixed so the same card
 * powers all three methods. A hidden field preserves the saved QR when no new
 * file is chosen (and when the method is off).
 */
function WalletCard({
  prefix,
  label,
  nameLabel,
  numberLabel,
  numberPlaceholder,
  hint,
  enabled,
  setEnabled,
  initial,
}: {
  prefix: "gcash" | "maya" | "bank";
  label: string;
  nameLabel: string;
  numberLabel: string;
  numberPlaceholder: string;
  hint: string;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  initial: { name: string; number: string; qrUrl: string };
}) {
  return (
    <>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name={`${prefix}Enabled`} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {label}
      </label>
      {enabled && (
        <div className="mt-3 space-y-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-plum-ink/60">{nameLabel}</label>
              <input name={`${prefix}Name`} defaultValue={initial.name} placeholder="e.g. Juan D." className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-plum-ink/60">{numberLabel}</label>
              <input name={`${prefix}Number`} defaultValue={initial.number} inputMode="tel" placeholder={numberPlaceholder} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">{label} QR code</label>
            <div className="flex items-center gap-3">
              {initial.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={initial.qrUrl} alt={`${label} QR`} className="h-20 w-20 rounded-lg border border-plum-ink/10 object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-plum-ink/20 text-2xl">📷</div>
              )}
              <div className="min-w-0">
                <input type="file" name={`${prefix}Qr`} accept="image/png,image/jpeg,image/webp" className="text-xs" />
                <p className="mt-1 text-xs text-plum-ink/45">{hint}</p>
              </div>
            </div>
            <input type="hidden" name={`${prefix}QrUrl`} value={initial.qrUrl} />
          </div>
        </div>
      )}
      {!enabled && <input type="hidden" name={`${prefix}QrUrl`} value={initial.qrUrl} />}
    </>
  );
}

export function StorefrontForm({
  initial,
}: {
  initial: {
    hours: DayHours[];
    zones: { name: string; feePesos: number }[];
    pauseWhenClosed: boolean;
    acceptsBookings: boolean;
    booking: {
      requireDownpayment: boolean;
      downpaymentType: "percent" | "fixed";
      downpaymentValue: number; // percent, or PESOS (already converted from centavos)
      downpaymentInstructions: string;
    };
    payment: {
      codEnabled: boolean;
      codFeeEnabled: boolean;
      codFeePesos: number;
      gcashEnabled: boolean;
      gcashName: string;
      gcashNumber: string;
      gcashQrUrl: string;
      mayaEnabled: boolean;
      mayaName: string;
      mayaNumber: string;
      mayaQrUrl: string;
      bankEnabled: boolean;
      bankName: string;
      bankNumber: string;
      bankQrUrl: string;
      packagingFeeEnabled: boolean;
      packagingFeePesos: number;
      packagingFeeScope: "delivery" | "all";
      packagingFeeMode: "order" | "item";
      requireReceipt: boolean;
      showVat: boolean;
    };
    delivery: {
      mode: "zones" | "distance" | "shipping";
      baseFeePesos: number;
      perKmPesos: number;
      freeKm: number;
      minFeePesos: number;
      maxKm: number;
      roadFactor: number;
      originLat: number | null;
      originLng: number | null;
      feeInTotal: boolean;
      mapEnabled: boolean;
      selfBookRider: boolean;
      selfBookRiderNote: string;
      fulfillment: "both" | "pickup" | "delivery";
    };
  };
}) {
  const [state, action] = useActionState<StorefrontState, FormData>(updateStorefront, null);
  const [zones, setZones] = useState(initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }]);
  const [requireDp, setRequireDp] = useState(initial.booking.requireDownpayment);
  const [dpType, setDpType] = useState<"percent" | "fixed">(initial.booking.downpaymentType);
  const [gcashOn, setGcashOn] = useState(initial.payment.gcashEnabled);
  const [mayaOn, setMayaOn] = useState(initial.payment.mayaEnabled);
  const [bankOn, setBankOn] = useState(initial.payment.bankEnabled);
  const [codFeeOn, setCodFeeOn] = useState(initial.payment.codFeeEnabled);
  const [selfRiderOn, setSelfRiderOn] = useState(initial.delivery.selfBookRider);
  const [packagingOn, setPackagingOn] = useState(initial.payment.packagingFeeEnabled);
  const [deliveryMode, setDeliveryMode] = useState<"zones" | "distance" | "shipping">(initial.delivery.mode);
  const [fulfillment, setFulfillment] = useState<"both" | "pickup" | "delivery">(initial.delivery.fulfillment);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    initial.delivery.originLat != null && initial.delivery.originLng != null
      ? { lat: initial.delivery.originLat, lng: initial.delivery.originLng }
      : null,
  );

  // Re-seed from the server whenever the saved zones change (e.g. after a save
  // revalidates the page). Without this the fields are uncontrolled and React 19
  // resets them to empty after the form action, hiding the zone you just saved.
  const initialZonesKey = JSON.stringify(initial.zones);
  useEffect(() => {
    const next = initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }];
    setZones(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialZonesKey]);

  return (
    <form action={action} className="space-y-6">
      {/* Store hours */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Store hours</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Shown on your website (Philippine time).</p>
        <div className="mt-4 space-y-2">
          {DAY_LABELS.map((label, i) => (
            <HoursRow key={i} label={label} index={i} initial={initial.hours[i]} />
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-cream/60 px-3 py-2 text-xs text-plum-ink/60">
          Closing after midnight? Put the real closing time in — a Saturday that runs to
          2:30 AM is <strong>Sat 10:00 – 02:30</strong>, and the row says
          &ldquo;closes next day&rdquo; so you can see it took it that way. Don&apos;t
          stretch Sunday&apos;s hours to cover Saturday&apos;s late night; each day
          carries its own session through to its own closing time.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="pauseWhenClosed" defaultChecked={initial.pauseWhenClosed} />
          Pause online ordering when closed
        </label>
      </div>

      {/* Delivery pricing */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Delivery &amp; pick-up</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Choose what the online store offers, and how the delivery fee is worked out.</p>

        {/* Fulfillment — which order types the online store accepts. */}
        <div className="mt-3">
          <label className="mb-1 block text-sm font-semibold text-plum-ink/70">Online orders accept</label>
          <select
            name="fulfillment"
            value={fulfillment}
            onChange={(e) => setFulfillment(e.target.value as "both" | "pickup" | "delivery")}
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm sm:w-72"
          >
            <option value="both">Pick-up &amp; delivery</option>
            <option value="pickup">Pick-up only (no delivery)</option>
            <option value="delivery">Delivery only (no pick-up)</option>
          </select>
          {fulfillment === "pickup" && (
            <p className="mt-1 text-xs text-plum-ink/50">Customers can only order for pick-up — delivery settings below are hidden.</p>
          )}
        </div>

        <input type="hidden" name="deliveryMode" value={deliveryMode} />
        <input type="hidden" name="originLat" value={origin?.lat ?? ""} />
        <input type="hidden" name="originLng" value={origin?.lng ?? ""} />

        <div className={fulfillment === "pickup" ? "hidden" : ""}>

        {/* Mode toggle */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-plum-ink/5 p-1 sm:max-w-lg">
          <button type="button" onClick={() => setDeliveryMode("zones")} className={`rounded-md py-2 text-xs font-semibold sm:text-sm ${deliveryMode === "zones" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}>
            📍 By zone
          </button>
          <button type="button" onClick={() => setDeliveryMode("distance")} className={`rounded-md py-2 text-xs font-semibold sm:text-sm ${deliveryMode === "distance" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}>
            📏 By distance
          </button>
          <button type="button" onClick={() => setDeliveryMode("shipping")} className={`rounded-md py-2 text-xs font-semibold sm:text-sm ${deliveryMode === "shipping" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}>
            🚚 Nationwide shipping
          </button>
        </div>
        {deliveryMode === "shipping" && (
          <p className="mt-2 rounded-lg bg-brand-primary/5 px-3 py-2 text-xs text-plum-ink/60">
            For e-commerce that ships by courier (J&amp;T, LBC, Flash…). Customers enter a full postal
            address — <span className="font-semibold text-plum-ink/70">no map pin</span> — and pick a
            shipping region below for the fee. The shipping fee is always added to the total (prepaid).
          </p>
        )}

        {/* Who collects the delivery fee (not shown for shipping — always prepaid). */}
        <label className={`mt-3 ${deliveryMode === "shipping" ? "hidden" : "flex"} items-start gap-2 text-sm font-semibold`}>
          <input type="checkbox" name="deliveryFeeInTotal" defaultChecked={initial.delivery.feeInTotal} className="mt-0.5" />
          <span>
            Include the delivery fee in the order total (customers pay it in-app)
            <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
              Uncheck if the <strong>customer pays the rider directly</strong> — then only the food is
              charged/paid online (GCash QR or cash), and the fee shown is just an estimate settled
              with the courier. Useful when courier rates differ from the app&apos;s estimate.
            </span>
          </span>
        </label>

        {/* Map pin toggle — not relevant to shipping (typed address, no pin). */}
        <label className={`mt-3 ${deliveryMode === "shipping" ? "hidden" : "flex"} items-start gap-2 text-sm font-semibold`}>
          <input type="checkbox" name="mapEnabled" defaultChecked={initial.delivery.mapEnabled} className="mt-0.5" />
          <span>
            Ask customers to pin their location on a map at checkout
            <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
              Uncheck to <strong>hide the map</strong> — customers just type their delivery address.
              {deliveryMode === "distance" && (
                <span className="text-guava"> Distance-based fees need the pin, so the map stays on in this mode.</span>
              )}
            </span>
          </span>
        </label>

        {/* Self-book rider — for stores with no delivery fleet: after placing,
            the customer is asked to book their own rider. */}
        <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="selfBookRider"
              checked={selfRiderOn}
              onChange={(e) => setSelfRiderOn(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Ask the customer to book their own rider after ordering
              <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
                For stores without their own riders. After placing a delivery order, the customer is
                shown a note to book a rider (Lalamove, Grab, etc.) to pick up.
              </span>
            </span>
          </label>
          {selfRiderOn ? (
            <textarea
              name="selfBookRiderNote"
              defaultValue={initial.delivery.selfBookRiderNote}
              rows={2}
              maxLength={500}
              placeholder="e.g. Please book a Lalamove/Grab rider to pick up your order once we confirm it's ready. We'll message you when to book."
              className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
          ) : (
            <input type="hidden" name="selfBookRiderNote" value={initial.delivery.selfBookRiderNote} />
          )}
        </div>

        {/* Zones / shipping-regions editor (kept mounted so values persist across modes). */}
        <div className={deliveryMode !== "distance" ? "mt-4" : "hidden"}>
          <p className="mb-2 text-sm text-plum-ink/50">
            {deliveryMode === "shipping"
              ? "Customers pick a shipping region at checkout; its fee is added to the total. e.g. Metro Manila, Luzon, Visayas, Mindanao."
              : "Customers pick a zone at checkout; its fee is added to the total."}
          </p>
          <div className="space-y-2">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="zoneName"
                  value={z.name}
                  onChange={(e) => setZones((p) => p.map((zz, idx) => (idx === i ? { ...zz, name: e.target.value } : zz)))}
                  placeholder={deliveryMode === "shipping" ? "Region (e.g. Metro Manila)" : "Zone (e.g. Poblacion)"}
                  className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-plum-ink/50">₱</span>
                  <input
                    name="zoneFee"
                    type="number"
                    step="0.01"
                    min={0}
                    value={z.feePesos}
                    onChange={(e) => setZones((p) => p.map((zz, idx) => (idx === i ? { ...zz, feePesos: Number(e.target.value) } : zz)))}
                    className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  />
                </div>
                <button type="button" onClick={() => setZones((p) => p.filter((_, idx) => idx !== i))} className="text-sm text-muted hover:text-guava">remove</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setZones((p) => [...p, { name: "", feePesos: 0 }])} className="mt-3 rounded-full border border-plum-ink/15 px-4 py-1.5 text-sm font-semibold">
            {deliveryMode === "shipping" ? "+ Add region" : "+ Add zone"}
          </button>
        </div>

        {/* Distance settings — numeric inputs stay mounted; only the map mounts
            in distance mode (Leaflet needs a visible container). */}
        <div className={deliveryMode === "distance" ? "mt-4 space-y-4" : "hidden"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Base fee (₱)</span>
              <input name="baseFeePesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.baseFeePesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Per km (₱)</span>
              <input name="perKmPesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.perKmPesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Free within (km)</span>
              <input name="freeKm" type="number" step="0.1" min={0} defaultValue={initial.delivery.freeKm} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Minimum fee (₱)</span>
              <input name="minFeePesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.minFeePesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Max distance (km, 0 = no limit)</span>
              <input name="maxKm" type="number" step="0.1" min={0} defaultValue={initial.delivery.maxKm} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Road factor (≈ road vs straight line)</span>
              <input name="roadFactor" type="number" step="0.05" min={1} defaultValue={initial.delivery.roadFactor} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
          </div>
          <p className="text-xs text-plum-ink/45">
            Fee = base + (distance − free km) × per-km, but never below the minimum. Distance is straight-line ×
            road factor. e.g. base ₱30, ₱10/km, 1 km free → 4 km away ≈ ₱30 + 3×₱10 = ₱60.
          </p>
          <div>
            <p className="mb-1 text-sm font-semibold text-plum-ink/60">Your store location (search your address or drop the pin on your store)</p>
            {deliveryMode === "distance" && (
              <LocationPicker enableSearch initial={origin} onChange={(lat, lng) => setOrigin({ lat, lng })} />
            )}
            {!origin && <p className="mt-1 text-xs text-guava">Pin your store so we can measure distance to each customer.</p>}
          </div>
        </div>
        </div>
      </div>

      {/* Payment methods */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Payment methods</h2>
        <p className="mt-1 text-sm text-plum-ink/50">
          How online customers can pay. Cash means they pay on pickup/delivery. GCash shows your QR
          code at checkout for the customer to scan, then they enter their reference number.
        </p>

        {/* VAT display — many PH stores are non-VAT (percentage tax) and
            shouldn't show "VAT (12%) included". Prices are unchanged either way. */}
        <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="showVat" defaultChecked={initial.payment.showVat} />
            Show “VAT (12%) included” at checkout
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            Turn this off if your business is non-VAT (percentage tax). Prices don’t change — only the
            “VAT (12%) included” line on the online website is hidden.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="codEnabled" defaultChecked={initial.payment.codEnabled} />
          Cash (on pickup / delivery)
        </label>

        {/* COD fee — an extra charge on cash-on-delivery orders. */}
        <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="codFeeEnabled" checked={codFeeOn} onChange={(e) => setCodFeeOn(e.target.checked)} />
            Charge a COD fee on cash-on-delivery orders
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            Added on top of the delivery fee when a <span className="font-semibold text-plum-ink/70">delivery</span> order
            is paid by cash. Not charged on pickup or GCash-paid orders.
          </p>
          {codFeeOn ? (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-sm text-plum-ink/50">₱</span>
              <input
                name="codFeePesos"
                type="number"
                step="0.01"
                min={0}
                defaultValue={initial.payment.codFeePesos}
                placeholder="0.00"
                className="w-32 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
              <span className="text-sm text-plum-ink/50">COD fee</span>
            </div>
          ) : (
            <input type="hidden" name="codFeePesos" value={initial.payment.codFeePesos} />
          )}
        </div>

        {/* Packaging fee — a flat charge for food packaging (tubs/containers). */}
        <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="packagingFeeEnabled" checked={packagingOn} onChange={(e) => setPackagingOn(e.target.checked)} />
            Charge a food-packaging fee
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            A fee for tubs/containers on to-go orders, added to the order total — charged once per
            order, or per item (× quantity).
          </p>
          {packagingOn ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm text-plum-ink/50">₱</span>
                <input
                  name="packagingFeePesos"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={initial.payment.packagingFeePesos}
                  placeholder="0.00"
                  className="w-32 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
                <span className="text-sm text-plum-ink/50">packaging fee</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Charge</label>
                <select
                  name="packagingFeeMode"
                  defaultValue={initial.payment.packagingFeeMode}
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm sm:w-56"
                >
                  <option value="order">Once per order</option>
                  <option value="item">Per item (× quantity)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Apply to</label>
                <select
                  name="packagingFeeScope"
                  defaultValue={initial.payment.packagingFeeScope}
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm sm:w-56"
                >
                  <option value="delivery">Delivery only</option>
                  <option value="all">Pickup &amp; delivery</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <input type="hidden" name="packagingFeePesos" value={initial.payment.packagingFeePesos} />
              <input type="hidden" name="packagingFeeScope" value={initial.payment.packagingFeeScope} />
              <input type="hidden" name="packagingFeeMode" value={initial.payment.packagingFeeMode} />
            </>
          )}
        </div>

        <WalletCard
          prefix="gcash"
          label="GCash"
          nameLabel="GCash account name"
          numberLabel="GCash number"
          numberPlaceholder="09XX XXX XXXX"
          hint="Upload a screenshot of your GCash “Receive money” QR. Max 4 MB."
          enabled={gcashOn}
          setEnabled={setGcashOn}
          initial={{ name: initial.payment.gcashName, number: initial.payment.gcashNumber, qrUrl: initial.payment.gcashQrUrl }}
        />
        <WalletCard
          prefix="maya"
          label="Maya"
          nameLabel="Maya account name"
          numberLabel="Maya number"
          numberPlaceholder="09XX XXX XXXX"
          hint="Upload a screenshot of your Maya “Receive money” QR. Max 4 MB."
          enabled={mayaOn}
          setEnabled={setMayaOn}
          initial={{ name: initial.payment.mayaName, number: initial.payment.mayaNumber, qrUrl: initial.payment.mayaQrUrl }}
        />
        <WalletCard
          prefix="bank"
          label="Bank transfer / QR"
          nameLabel="Bank & account name"
          numberLabel="Account number"
          numberPlaceholder="e.g. BPI 1234-5678-90"
          hint="Upload your bank / InstaPay / QR Ph code. Max 4 MB."
          enabled={bankOn}
          setEnabled={setBankOn}
          initial={{ name: initial.payment.bankName, number: initial.payment.bankNumber, qrUrl: initial.payment.bankQrUrl }}
        />

        {/* Proof of payment — blocks checkout until a screenshot is attached. */}
        <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="requireReceipt"
              defaultChecked={initial.payment.requireReceipt}
              className="mt-0.5"
            />
            <span>
              Require the customer to upload a payment receipt
              <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
                They can&apos;t place the order until a screenshot is attached. Applies to whichever
                online method they pick (GCash, Maya or bank) — cash orders are unaffected.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Advance booking & ordering */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Book &amp; order ahead</h2>
        <p className="mt-1 text-sm text-plum-ink/50">
          Adds a <span className="font-semibold text-plum-ink/70">Book / Order ahead</span> button to
          your website so customers can either reserve a table (shows under{" "}
          <span className="font-semibold text-plum-ink/70">Reservations</span>) or place a food order
          scheduled for a future date/time (shows in your orders with the requested time).
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="acceptsBookings" defaultChecked={initial.acceptsBookings} />
          Accept table bookings &amp; advance orders on my website
        </label>

        {/* Downpayment / approval */}
        <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="requireDownpayment"
              checked={requireDp}
              onChange={(e) => setRequireDp(e.target.checked)}
            />
            Require a downpayment before an advance order is approved
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            Advance orders always land in <span className="font-semibold text-plum-ink/70">Advance orders</span> for
            you to approve. With this on, customers are shown a downpayment amount and your payment
            instructions, and enter a reference (e.g. GCash) you can verify before approving.
          </p>
          {requireDp && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  name="downpaymentType"
                  value={dpType}
                  onChange={(e) => setDpType(e.target.value as "percent" | "fixed")}
                  className="rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
                >
                  <option value="percent">% of order total</option>
                  <option value="fixed">Fixed amount (₱)</option>
                </select>
                <div className="flex items-center gap-1">
                  {dpType === "fixed" && <span className="text-sm text-plum-ink/50">₱</span>}
                  <input
                    name="downpaymentValue"
                    type="number"
                    min={0}
                    max={dpType === "percent" ? 100 : undefined}
                    step={dpType === "percent" ? 1 : 0.01}
                    defaultValue={initial.booking.downpaymentValue}
                    className="w-28 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  />
                  {dpType === "percent" && <span className="text-sm text-plum-ink/50">%</span>}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Payment instructions (shown to the customer)</label>
                <textarea
                  name="downpaymentInstructions"
                  rows={2}
                  defaultValue={initial.booking.downpaymentInstructions}
                  placeholder="e.g. Send the downpayment via GCash to 0917-123-4567 (Juan D.), then enter the reference number below."
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {/* Keep the hidden fields submitting even when the panel is collapsed. */}
          {!requireDp && (
            <>
              <input type="hidden" name="downpaymentType" value={dpType} />
              <input type="hidden" name="downpaymentValue" value={initial.booking.downpaymentValue} />
              <input type="hidden" name="downpaymentInstructions" value={initial.booking.downpaymentInstructions} />
            </>
          )}
        </div>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save storefront settings</SubmitButton>
    </form>
  );
}
