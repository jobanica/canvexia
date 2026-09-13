"use client";

import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { getMyLoyalty, joinLoyalty } from "@/server/loyalty/public";

/**
 * Diner rewards: join the loyalty program (phone + name) and track points. The
 * phone is remembered and attached to future orders so points accrue
 * automatically — and it's the key the cashier uses to apply rewards.
 */
export function RewardsPanel({
  slug,
  phone,
  name,
  onPhone,
}: {
  slug: string;
  phone: string;
  name?: string;
  onPhone: (phone: string, name?: string) => void;
}) {
  const [phoneInput, setPhoneInput] = useState(phone);
  const [nameInput, setNameInput] = useState(name ?? "");
  const [points, setPoints] = useState<number | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function load(p: string) {
    if (!p.trim()) return;
    const res = await getMyLoyalty(slug, p.trim());
    if (res) {
      setPoints(res.points);
      setValue(res.points * res.pointValue);
    }
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await joinLoyalty(slug, phoneInput.trim(), nameInput.trim());
    setBusy(false);
    if (res.ok) {
      setJoined(true);
      setPoints(res.points ?? 0);
      onPhone(phoneInput.trim(), nameInput.trim() || undefined);
      load(phoneInput.trim());
    } else {
      setError(res.error ?? "Couldn't join.");
    }
  }

  // Auto-load balance if we already know the phone.
  useEffect(() => {
    if (phone) {
      setJoined(true);
      load(phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
      <p className="font-heading font-bold text-brand-ink">⭐ Loyalty &amp; Rewards</p>
      <p className="mt-0.5 text-xs text-brand-ink/60">
        Earn points on every order and redeem them for discounts. Join with your phone number.
      </p>

      <div className="mt-3 space-y-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        <input
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          inputMode="tel"
          placeholder="09xx xxx xxxx"
          className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        <button
          onClick={join}
          disabled={busy || !phoneInput.trim()}
          className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {busy ? "…" : joined ? "Update / refresh points" : "Join rewards"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-guava">{error}</p>}
      {points !== null && (
        <p className="mt-3 text-sm text-brand-ink">
          {joined && <span className="font-semibold">You&apos;re in! </span>}
          You have <span className="font-bold">{points} points</span>
          {value > 0 && <span className="text-brand-ink/60"> (worth {formatPeso(value)})</span>}.
          <br />
          <span className="text-xs text-brand-ink/50">
            Give this phone number to the cashier to redeem.
          </span>
        </p>
      )}
    </div>
  );
}
