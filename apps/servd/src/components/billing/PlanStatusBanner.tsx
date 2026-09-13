"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatPeso } from "@/lib/money";
import { capFor } from "@/lib/billing/planLimits";
import {
  getBannerState,
  manilaYmd,
  trialDaysLeft,
  START_ONLY,
  type BannerState,
  type PlanBannerData,
} from "@/lib/billing/planBanner";

/**
 * The one and only plan-status banner. Rendered on the merchant "tap to start"
 * screen (surface="start") and at the top of the dashboard (surface="dashboard")
 * — same component, so the two surfaces can never drift.
 *
 * Every upgrade CTA points to the plan page (Growth ₱999). The hidden Lite save
 * offer is NEVER surfaced here — no price, no tier name, no downgrade path.
 */

const CTA_HREF = "/admin/billing"; // "understand your plan" page, not a checkout
const STARTER_CAP = capFor("starter"); // post-trial / Free monthly cap (100)

function fmtDate(d: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(
    new Date(d),
  );
}

function firstOfNextMonth(now: Date): string {
  const [y, m] = manilaYmd(now).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fmtDate(new Date(Date.UTC(ny, nm - 1, 1, 12)));
}

/** Projected cap-hit date at the current pace — only if it lands this month. */
function projectedCapDate(data: PlanBannerData, now: Date): string | null {
  const cap = data.cap;
  if (!cap) return null;
  const [y, m, day] = manilaYmd(now).split("-").map(Number);
  if (data.ordersThisMonth <= 0 || day <= 0) return null;
  const perDay = data.ordersThisMonth / day;
  if (perDay <= 0) return null;
  const daysToCap = Math.ceil(cap / perDay);
  const projected = new Date(Date.UTC(y, m - 1, daysToCap, 12));
  const [py, pm] = manilaYmd(projected).split("-").map(Number);
  if (py !== y || pm !== m) return null; // outside the current month → omit
  return fmtDate(projected);
}

// How each state may be dismissed. "day" = once per Manila day; "session" = per
// tab session; undefined = not dismissible.
const DISMISS: Partial<Record<BannerState, "day" | "session">> = {
  trial_receipt: "day",
  trial_warning: "session",
  downgrade_confirm: "day",
};

const TONE: Record<string, string> = {
  grey: "border-plum-ink/10 bg-plum-ink/5 text-plum-ink",
  blue: "border-sky-300/50 bg-sky-50 text-plum-ink",
  amber: "border-mango/40 bg-mango/10 text-plum-ink",
  red: "border-guava/50 bg-guava/10 text-plum-ink",
  green: "border-emerald-400/50 bg-emerald-50 text-plum-ink",
};

function Cta({ children, subtle }: { children: ReactNode; subtle?: boolean }) {
  return (
    <Link
      href={CTA_HREF}
      className={
        subtle
          ? "whitespace-nowrap rounded-full border border-plum-ink/20 px-3 py-1.5 text-xs font-semibold text-plum-ink/70"
          : "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold btn-brand"
      }
    >
      {children}
    </Link>
  );
}

export function PlanStatusBanner({
  data,
  surface,
}: {
  data: PlanBannerData;
  surface: "start" | "dashboard";
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const now = new Date();
  const state = getBannerState(data, now);

  // Dismissal lives in local/session storage — no table needed.
  const dismissMode = DISMISS[state];
  const storageKey = dismissMode === "day" ? `servd_pb_${state}_${manilaYmd(now)}` : `servd_pb_${state}`;
  useEffect(() => {
    setMounted(true);
    if (!dismissMode) return;
    try {
      const store = dismissMode === "day" ? window.localStorage : window.sessionStorage;
      if (store.getItem(storageKey) === "1") setDismissed(true);
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function dismiss() {
    setDismissed(true);
    if (!dismissMode) return;
    try {
      const store = dismissMode === "day" ? window.localStorage : window.sessionStorage;
      store.setItem(storageKey, "1");
    } catch {
      /* storage blocked */
    }
  }

  if (!mounted) return null;
  if (state === "hidden") return null;
  if (surface === "dashboard" && START_ONLY.has(state)) return null;
  if (dismissMode && dismissed) return null;

  const daysLeft = trialDaysLeft(data.trialEndsAt, now) ?? 0;
  const endDate = data.trialEndsAt ? fmtDate(data.trialEndsAt) : "";
  const cap = data.cap ?? STARTER_CAP;
  const remaining = Math.max(0, cap - data.ordersThisMonth);

  let tone = "grey";
  let body: ReactNode = null;

  switch (state) {
    case "trial_quiet":
      tone = "grey";
      body = (
        <div>
          <p className="text-sm font-semibold">🟠 Full access · {daysLeft} days left</p>
          <p className="text-xs text-plum-ink/60">Unlimited orders · GCash/card · Instant alerts</p>
        </div>
      );
      break;
    case "trial_receipt":
      tone = "blue";
      body = (
        <div>
          <p className="text-sm font-semibold">
            📊 {data.ordersThisMonth} orders, {formatPeso(data.monthValue)} this month.
          </p>
          <p className="text-xs text-plum-ink/70">
            Full access ends <span className="font-semibold">{endDate}</span>. Libre pa rin ang page mo
            after — {STARTER_CAP} orders/buwan, cash payment.
          </p>
        </div>
      );
      break;
    case "trial_warning":
      tone = "amber";
      body = (
        <div>
          <p className="text-sm font-semibold">⚠️ {daysLeft} araw na lang ang full access mo.</p>
          <p className="text-xs text-plum-ink/70">
            After {endDate}, mawawala ang GCash/card payment at instant alerts. Libre pa rin ang
            ordering page mo — {STARTER_CAP} orders/buwan, cash.
          </p>
        </div>
      );
      break;
    case "trial_final":
      tone = "red";
      body = (
        <div>
          <p className="text-sm font-semibold">🔔 Huling araw ng full access mo.</p>
          <p className="text-xs text-plum-ink/70">{data.ordersThisMonth} orders this month.</p>
        </div>
      );
      break;
    case "downgrade_confirm":
      tone = "green";
      body = (
        <div>
          <p className="text-sm font-semibold">✅ Starter — live pa rin ang page mo.</p>
          <p className="text-xs text-plum-ink/70">
            Sa&apos;yo pa rin: ordering page, QR code, menu, {STARTER_CAP} orders/buwan, cash payment.
            Naka-pause: online payments, instant alerts.
          </p>
        </div>
      );
      break;
    case "cap_normal":
      tone = "grey";
      body = (
        <p className="text-sm">
          ✅ {data.plan === "lite" ? "Lite" : "Starter"} ·{" "}
          <span className="font-semibold">
            {data.ordersThisMonth} / {cap}
          </span>{" "}
          orders this month
        </p>
      );
      break;
    case "cap_amber": {
      tone = "amber";
      const proj = projectedCapDate(data, now);
      body = (
        <p className="text-sm">
          <span className="font-semibold">
            {data.ordersThisMonth} / {cap}
          </span>{" "}
          orders used.{proj ? ` At this pace, aabot ka sa cap around ${proj}.` : ""}
        </p>
      );
      break;
    }
    case "cap_red":
      tone = "red";
      body = (
        <p className="text-sm">
          <span className="font-semibold">
            {data.ordersThisMonth} / {cap}
          </span>{" "}
          orders used — <span className="font-semibold">{remaining} na lang</span> bago ma-pause ang
          ordering.
        </p>
      );
      break;
    case "cap_paused":
      tone = "red";
      body = (
        <div>
          <p className="text-sm font-semibold">
            🎉 Umabot ka sa {cap} orders this month — totoong buwan &apos;yan.
          </p>
          <p className="text-xs text-plum-ink/70">
            Magre-resume ang ordering sa <span className="font-semibold">{firstOfNextMonth(now)}</span>.
          </p>
        </div>
      );
      break;
  }

  // CTA row per state.
  let cta: ReactNode = null;
  if (state === "trial_receipt") cta = <Cta subtle>Tingnan kung ano ang magbabago</Cta>;
  else if (state === "trial_warning") cta = <Cta>Ituloy — ₱999/buwan</Cta>;
  else if (state === "trial_final")
    cta = (
      <div className="flex items-center gap-2">
        <Cta>Ituloy</Cta>
        <Cta subtle>Okay lang, free na ako</Cta>
      </div>
    );
  else if (state === "downgrade_confirm") cta = <Cta>Reactivate — ₱999/buwan</Cta>;
  else if (state === "cap_paused") cta = <Cta>Alisin ang cap — ₱999/buwan</Cta>;
  else if (state === "cap_normal") cta = <Cta subtle>Go Unlimited</Cta>;
  else if (state === "cap_amber" || state === "cap_red") cta = <Cta>Go Unlimited</Cta>;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-tile border p-3 ${TONE[tone]}`}>
      <div className="min-w-[200px] flex-1">{body}</div>
      <div className="flex items-center gap-2">
        {cta}
        {dismissMode && (
          <button onClick={dismiss} aria-label="Dismiss" className="text-plum-ink/40 hover:text-plum-ink">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
