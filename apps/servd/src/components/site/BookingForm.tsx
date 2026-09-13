"use client";

import { useMemo, useState } from "react";
import { createPublicBooking } from "@/server/reservations/public-booking";
import { isValidPhone, phoneError } from "@/lib/phone";

interface DayHours { open: string; close: string; closed: boolean }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function pad(n: number): string { return String(n).padStart(2, "0"); }
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m || 0)} ${period}`;
}
/** YYYY-MM-DD for a local calendar day (no UTC shift). */
function dayKey(y: number, mo: number, d: number): string {
  return `${y}-${pad(mo + 1)}-${pad(d)}`;
}

export function BookingForm({
  slug,
  restaurantName,
  logoUrl,
  hours,
  homeHref,
  orderHref,
}: {
  slug: string;
  restaurantName: string;
  logoUrl?: string | null;
  hours: DayHours[];
  homeHref: string;
  orderHref: string; // the menu URL — advance orders deep-link here with ?for=ISO
}) {
  const [mode, setMode] = useState<"table" | "order">("table");
  const now = useMemo(() => new Date(), []);
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [viewY, setViewY] = useState(now.getFullYear());
  const [viewM, setViewM] = useState(now.getMonth());
  const [date, setDate] = useState<string | null>(null); // YYYY-MM-DD
  const [time, setTime] = useState<string | null>(null); // HH:MM
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const phoneErr = phoneError(phone);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Build the visible month grid (leading blanks so day 1 lands on its weekday).
  const cells = useMemo(() => {
    const firstDow = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [viewY, viewM]);

  // Time slots for the chosen date, from that weekday's opening hours.
  const slots = useMemo(() => {
    if (!date) return [];
    const [y, mo, d] = date.split("-").map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    const h = hours[dow];
    if (!h || h.closed) return [];
    const open = toMinutes(h.open);
    let close = toMinutes(h.close);
    if (close <= open) close += 24 * 60; // past-midnight close
    const isToday = date === todayKey;
    const out: string[] = [];
    for (let t = open; t <= close; t += 30) {
      const mins = t % (24 * 60);
      if (isToday && mins <= nowMinutes + 15) continue; // no past / too-soon slots
      out.push(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
    }
    return out;
  }, [date, hours, todayKey, nowMinutes]);

  const canSubmit = date && time && name.trim() && isValidPhone(phone) && party >= 1 && !busy;

  function prevMonth() {
    // Don't page before the current month.
    if (viewY === now.getFullYear() && viewM === now.getMonth()) return;
    setViewM((m) => (m === 0 ? 11 : m - 1));
    if (viewM === 0) setViewY((y) => y - 1);
  }
  function nextMonth() {
    setViewM((m) => (m === 11 ? 0 : m + 1));
    if (viewM === 11) setViewY((y) => y + 1);
  }

  function pickDay(d: number) {
    const key = dayKey(viewY, viewM, d);
    if (key < todayKey) return; // past
    const dow = new Date(viewY, viewM, d).getDay();
    if (hours[dow]?.closed) return; // closed that weekday
    setDate(key);
    setTime(null);
    setError(null);
  }

  async function submit() {
    if (!date || !time) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createPublicBooking({ slug, customerName: name, customerPhone: phone, partySize: party, date, time, note });
      if (res.ok) setDone(true);
      else setError(res.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const atCurrentMonth = viewY === now.getFullYear() && viewM === now.getMonth();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-plum-ink text-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={restaurantName} className="h-10 w-auto max-w-[120px] rounded-lg object-contain" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 font-bold">{restaurantName.charAt(0)}</div>
          )}
          <span className="font-heading text-lg font-extrabold">{restaurantName}</span>
          <a href={homeHref} className="ml-auto text-sm font-semibold text-white/80 hover:text-white">← Menu</a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        {done ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h1 className="font-heading text-2xl font-bold text-plum-ink">Booking requested!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-plum-ink/60">
              Thanks, {name.trim() || "friend"}. We&apos;ve received your table request for{" "}
              <span className="font-semibold text-plum-ink/80">{party} {party === 1 ? "person" : "people"}</span> on{" "}
              <span className="font-semibold text-plum-ink/80">{date}</span> at{" "}
              <span className="font-semibold text-plum-ink/80">{time ? to12h(time) : ""}</span>. We&apos;ll
              hold your table — see you soon!
            </p>
            <a href={homeHref} className="mt-6 inline-block rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white">
              Back to menu
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mode: reserve a table, or order food ahead for a future time. */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-plum-ink/5 p-1">
              <button
                type="button"
                onClick={() => { setMode("table"); setTime(null); setError(null); }}
                className={`rounded-lg py-2.5 text-sm font-bold transition ${mode === "table" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}
              >
                🍽 Reserve a table
              </button>
              <button
                type="button"
                onClick={() => { setMode("order"); setTime(null); setError(null); }}
                className={`rounded-lg py-2.5 text-sm font-bold transition ${mode === "order" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}
              >
                🥡 Advance order
              </button>
            </div>

            <div>
              <h1 className="font-heading text-2xl font-bold text-plum-ink">
                {mode === "table" ? "Book a table" : "Order ahead"}
              </h1>
              <p className="text-sm text-plum-ink/55">
                {mode === "table"
                  ? "Reserve ahead — pick a date and time and we'll hold your table."
                  : "Order now for later — pick a date and time, then choose your food."}
              </p>
            </div>

            {/* Calendar */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevMonth}
                  disabled={atCurrentMonth}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-plum-ink/70 enabled:hover:bg-gray-100 disabled:opacity-30"
                >
                  ←
                </button>
                <span className="font-heading font-bold text-plum-ink">{MONTHS[viewM]} {viewY}</span>
                <button type="button" onClick={nextMonth} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-plum-ink/70 hover:bg-gray-100">→</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DOW.map((d) => (
                  <div key={d} className="py-1 text-xs font-semibold text-plum-ink/40">{d}</div>
                ))}
                {cells.map((d, i) => {
                  if (d === null) return <div key={`b${i}`} />;
                  const key = dayKey(viewY, viewM, d);
                  const dow = new Date(viewY, viewM, d).getDay();
                  const isPast = key < todayKey;
                  const isClosed = !!hours[dow]?.closed;
                  const disabled = isPast || isClosed;
                  const selected = key === date;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickDay(d)}
                      disabled={disabled}
                      title={isClosed ? "Closed" : undefined}
                      className={`aspect-square rounded-lg text-sm font-semibold transition ${
                        selected
                          ? "bg-brand-primary text-white"
                          : disabled
                            ? "text-plum-ink/20 line-through"
                            : "text-plum-ink hover:bg-brand-primary/10"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            {date && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-2 font-heading text-sm font-bold text-plum-ink/70">Pick a time</p>
                {slots.length === 0 ? (
                  <p className="text-sm text-plum-ink/50">No times left for that day — please pick another date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setTime(s); setError(null); }}
                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                          time === s ? "border-brand-primary bg-brand-primary text-white" : "border-plum-ink/15 text-plum-ink hover:border-brand-primary"
                        }`}
                      >
                        {to12h(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Advance-order hand-off — pick the food on the menu, scheduled for
                the chosen time (carried via ?for=ISO). */}
            {mode === "order" && date && time && (
              <div className="space-y-3 rounded-2xl bg-white p-4 text-center shadow-sm">
                <p className="text-sm text-plum-ink/70">
                  We&apos;ll have your order ready for{" "}
                  <span className="font-semibold text-plum-ink">{date}</span> at{" "}
                  <span className="font-semibold text-plum-ink">{to12h(time)}</span>.
                </p>
                <a
                  href={`${orderHref}${orderHref.includes("?") ? "&" : "?"}for=${encodeURIComponent(`${date}T${time}:00+08:00`)}`}
                  className="block w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white"
                >
                  Choose your food →
                </a>
                <p className="text-xs text-plum-ink/45">You&apos;ll pick your items next; the time stays saved to your order.</p>
              </div>
            )}

            {/* Table reservation details */}
            {mode === "table" && date && time && (
              <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-plum-ink/70">Party size</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setParty((p) => Math.max(1, p - 1))} className="h-9 w-9 rounded-lg border border-plum-ink/15 text-lg font-bold text-plum-ink/70">−</button>
                    <span className="w-10 text-center font-heading text-lg font-bold">{party}</span>
                    <button type="button" onClick={() => setParty((p) => Math.min(50, p + 1))} className="h-9 w-9 rounded-lg border border-plum-ink/15 text-lg font-bold text-plum-ink/70">+</button>
                    <span className="text-sm text-plum-ink/50">{party === 1 ? "person" : "people"}</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-plum-ink/70">Your name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-plum-ink/70">Contact number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={13} placeholder="09XX XXX XXXX" aria-invalid={!!phoneErr} className={`w-full rounded-lg border px-3 py-2 text-sm ${phoneErr ? "border-guava" : "border-plum-ink/15"}`} />
                  {phoneErr && <p className="mt-1 text-xs text-guava">{phoneErr}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-plum-ink/70">Note <span className="font-normal text-plum-ink/40">(optional)</span></label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. birthday, near the window…" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                </div>

                {error && <p className="text-sm text-guava">{error}</p>}

                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy ? "Booking…" : `Book table for ${party} · ${date} · ${to12h(time)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
