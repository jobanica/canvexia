"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useOnline } from "@/lib/offline/useOnline";
import { drain, enqueue, newClientRef, queued } from "@/lib/partners/visit-queue";
import { parseScan } from "@/lib/partners/kiosk-scan";
import { QrScanner } from "@/components/partner/QrScanner";
import type { SessionRow, VisitRow } from "@/server/partners/attendance";

type Subject = { id: string; name: string; type: "prospect" | "merchant"; productId: string };

const OUTCOMES: { value: string; label: string }[] = [
  { value: "met_owner", label: "Met the owner" },
  { value: "not_available", label: "Not available" },
  { value: "follow_up", label: "Follow-up set" },
  { value: "signed", label: "Signed" },
];

/**
 * The field app: check in, log a visit, check out.
 *
 * ONE SCREEN, THREE BUTTONS, because it is used one-handed while standing up.
 *
 * LOCATION IS REQUESTED ONLY WHEN SOMETHING IS SUBMITTED. Never on mount, never
 * watched, never in the background. That is the brief's privacy rule and it is
 * also the difference between an app people install and one they uninstall: a
 * permission prompt on open, for a page they only meant to read, reads as
 * tracking.
 *
 * OFFLINE IS THE DEFAULT ASSUMPTION, not an error state. Everything is queued
 * locally first and sent when there is signal; the badge says how many are
 * waiting. The `clientRef` minted here is the server's idempotency key, so a
 * replay is a no-op rather than a second visit.
 */
export function FieldApp({
  session,
  visits,
  subjects,
  name,
  kioskRequired,
  scanned,
}: {
  session: SessionRow | null;
  visits: VisitRow[];
  subjects: Subject[];
  name: string;
  /** This seat must clock in at a kiosk; the GPS-only buttons are refused. */
  kioskRequired: boolean;
  /** A code already in the URL, because the phone's camera app opened it. */
  scanned: { kioskId: string; code: string } | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const [pending, startTransition] = useTransition();
  const [waiting, setWaiting] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  /**
   * The scan in hand, if any.
   *
   * Held in state rather than submitted the moment it is read, because the
   * person may have scanned before deciding whether they are clocking in or
   * out. A code is good for up to two minutes, which is the window this is
   * allowed to sit in — and the server is what enforces that, not this.
   */
  const [scan, setScan] = useState<{ kioskId: string; code: string } | null>(scanned);
  const [scanning, setScanning] = useState(false);

  const refreshQueue = useCallback(async () => {
    setWaiting((await queued()).length);
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  // Drain whenever the connection comes back. Not on a timer: a timer on a
  // phone in a dead zone is a battery drain with nothing to show for it.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      const { sent, left } = await drain();
      if (cancelled) return;
      setWaiting(left);
      if (sent > 0) {
        setNote(`${sent} ${sent === 1 ? "item" : "items"} synced.`);
        router.refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, router]);

  /**
   * A position, or null.
   *
   * Never rejects and never blocks for long: a denied permission, a phone with
   * the radio off and a person standing under a concrete awning all look the
   * same to this function, and all three of them still get to record that they
   * turned up.
   */
  const locate = (): Promise<{ lat: string; lng: string; accuracy: string }> =>
    new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return resolve({ lat: "", lng: "", accuracy: "" });
      }
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            lat: String(p.coords.latitude),
            lng: String(p.coords.longitude),
            accuracy: String(Math.round(p.coords.accuracy)),
          }),
        () => resolve({ lat: "", lng: "", accuracy: "" }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    });

  async function submit(kind: "check_in" | "check_out" | "visit", extra: Record<string, string>) {
    setNote(null);
    const pos = await locate();
    const clientRef = newClientRef();
    const fields: Record<string, string> = {
      ...extra,
      ...pos,
      ...(scan ? { kioskId: scan.kioskId, kioskCode: scan.code } : {}),
      device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
    };

    // A kiosk code is NEVER queued. It expires in about two minutes, so an
    // offline queue would send a dead one hours later and produce a failure
    // nobody can explain. A seat that must use a kiosk is a seat that must be
    // online at the counter, which is where the kiosk is.
    if (!online && (kioskRequired || scan)) {
      setNote("You need a connection to clock in at the kiosk. Try again in a moment.");
      return;
    }

    if (!online) {
      await enqueue({ clientRef, kind, fields });
      await refreshQueue();
      setNote("Saved on this phone. It will send when you have signal.");
      return;
    }

    try {
      const body = new URLSearchParams({ ...fields, clientRef, kind });
      const res = await fetch("/api/partner/field/sync", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; error: string | null };
      if (!res.ok) throw new Error("network");
      if (!json.ok) {
        setNote(json.error ?? "That didn't go through.");
        return;
      }
      setNote(kind === "visit" ? "Visit logged." : "Done.");
      // Used once. Keeping it would let a second tap re-use the same code, and
      // would leave a stale one in hand after it expires.
      if (kind !== "visit") setScan(null);
      startTransition(() => router.refresh());
    } catch {
      // Online a moment ago, not now. Queue it rather than losing it.
      await enqueue({ clientRef, kind, fields });
      await refreshQueue();
      setNote("Saved on this phone. It will send when you have signal.");
    }
  }

  const checkedIn = !!session && !session.checkOutAt;

  /** A scanned string becomes a kiosk id and a code, or an honest complaint. */
  const acceptScan = useCallback((text: string) => {
    setScanning(false);
    const parsed = parseScan(text);
    if (!parsed) {
      setNote("That doesn't look like a kiosk code. Point at the square on the screen.");
      return;
    }
    setScan(parsed);
    setNote(null);
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-5">
      {scanning && <QrScanner onResult={acceptScan} onClose={() => setScanning(false)} />}
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">Hi, {name.split(/[\s@]/)[0]}</h1>
          <p className="text-xs text-brand-ink/50">
            {new Date().toLocaleDateString("en-PH", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Manila",
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${
            online
              ? "bg-brand-primary/12 text-brand-primary"
              : "bg-brand-ink/8 text-brand-ink/55"
          }`}
        >
          {online ? "Online" : "Offline"}
          {waiting > 0 && ` · ${waiting} waiting`}
        </span>
      </header>

      {note && (
        <p className="rounded-xl bg-brand-surface px-3 py-2 text-sm text-brand-ink/70">{note}</p>
      )}

      {/* --- Check in / out ---------------------------------------------- */}
      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Today</p>
        {session ? (
          <p className="mt-1 text-sm text-brand-ink/55">
            In at {fmtTime(session.checkInAt)}
            {session.method === "qr" && " at the kiosk"}
            {session.checkOutAt && ` · out at ${fmtTime(session.checkOutAt)}`}
            {session.autoClosed && " (closed automatically)"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-brand-ink/55">Not checked in yet.</p>
        )}

        {/* The kiosk half. Shown to everybody — anybody may clock in at a
            screen — but it is the ONLY way in for a seat marked kioskRequired,
            which is why the buttons below are disabled without a code. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setScanning(true)}
            className="min-h-[44px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold"
          >
            {scan ? "Scan again" : "Scan kiosk code"}
          </button>
          {scan && (
            <span className="text-xs font-semibold text-brand-primary">
              Code scanned — tap {session ? "check out" : "check in"}.
            </span>
          )}
          {!scan && kioskRequired && (
            <span className="text-xs text-brand-ink/50">
              You clock in at the kiosk, so scan the screen first.
            </span>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {!session && (
            <button
              onClick={() => void submit("check_in", {})}
              disabled={pending || (kioskRequired && !scan)}
              className="min-h-[48px] flex-1 rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-50"
            >
              Check in
            </button>
          )}
          {checkedIn && (
            <button
              onClick={() => void submit("check_out", {})}
              disabled={pending || (kioskRequired && !scan)}
              className="min-h-[48px] flex-1 rounded-full border border-brand-ink/15 px-5 text-sm font-semibold disabled:opacity-50"
            >
              Check out
            </button>
          )}
        </div>
        <p className="mt-3 text-[0.68rem] leading-relaxed text-brand-ink/40">
          Your location is read only when you tap one of these buttons or log a visit.
          Nothing is tracked in the background.
        </p>
      </section>

      {/* --- Log a visit -------------------------------------------------- */}
      <VisitForm subjects={subjects} onSubmit={(extra) => submit("visit", extra)} busy={pending} />

      {/* --- Today's visits ----------------------------------------------- */}
      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">
          Today&rsquo;s visits <span className="text-brand-ink/40">({visits.length})</span>
        </p>
        {visits.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/50">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-ink/5">
            {visits.map((v) => (
              <li key={v.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {v.subjectName ?? "Unknown"}
                  </span>
                  <span className="shrink-0 text-xs text-brand-ink/45">
                    {fmtTime(v.occurredAt)}
                  </span>
                </div>
                <p className="text-xs text-brand-ink/50">
                  {OUTCOMES.find((o) => o.value === v.outcome)?.label ?? v.outcome}
                  {v.flag === "far" && " · far from the address on file"}
                  {v.flag === "no_address" && " · no address on file"}
                  {v.flag === "no_location" && " · no location captured"}
                </p>
                {v.notes && <p className="mt-0.5 text-xs text-brand-ink/60">{v.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VisitForm({
  subjects,
  onSubmit,
  busy,
}: {
  subjects: Subject[];
  onSubmit: (extra: Record<string, string>) => Promise<void>;
  busy: boolean;
}) {
  const [subjectKey, setSubjectKey] = useState("");
  const [outcome, setOutcome] = useState("met_owner");
  const [notes, setNotes] = useState("");

  const field =
    "min-h-[48px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm";

  return (
    <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">Log a visit</p>
      <div className="mt-3 space-y-2">
        <select
          value={subjectKey}
          onChange={(e) => setSubjectKey(e.target.value)}
          className={field}
        >
          <option value="">Who did you visit?</option>
          {subjects.map((s) => (
            <option key={`${s.type}:${s.productId}:${s.id}`} value={`${s.type}:${s.productId}:${s.id}`}>
              {s.name} {s.type === "prospect" ? "(prospect)" : ""}
            </option>
          ))}
        </select>

        {/* Buttons, not a select: four options, tapped with a thumb. */}
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`min-h-[44px] rounded-lg border px-3 text-sm font-semibold ${
                outcome === o.value
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-brand-ink/15 text-brand-ink/60"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes (optional)"
          className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />

        <button
          disabled={!subjectKey || busy}
          onClick={async () => {
            const [type, productId, id] = subjectKey.split(":");
            await onSubmit({
              subjectType: type,
              productId,
              subjectId: id,
              outcome,
              notes,
            });
            setSubjectKey("");
            setNotes("");
            setOutcome("met_owner");
          }}
          className="min-h-[48px] w-full rounded-full px-5 text-sm font-semibold btn-brand text-white disabled:opacity-40"
        >
          Log the visit
        </button>
        <p className="text-[0.68rem] text-brand-ink/40">
          &ldquo;Signed&rdquo; moves them to Signed in the pipeline;
          &ldquo;Follow-up set&rdquo; moves them to Contacted.
        </p>
      </div>
    </section>
  );
}

const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
