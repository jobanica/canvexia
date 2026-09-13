"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginEmployee } from "@/server/hr/employee-auth";

/**
 * Employee sign-in by phone + PIN. When `slug` is provided (the workplace QR),
 * the workplace is fixed; otherwise the employee enters a workplace code.
 */
export function EmployeeLogin({ slug, restaurantName }: { slug?: string; restaurantName?: string }) {
  const router = useRouter();
  const [workplace, setWorkplace] = useState(slug ?? "");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await loginEmployee(workplace.trim(), phone, pin);
    setBusy(false);
    if (res.ok) router.push("/employee");
    else setError(res.error ?? "Couldn't sign in.");
  }

  return (
    <div className="mx-auto max-w-sm rounded-tile border border-plum-ink/10 bg-white p-6">
      <h1 className="font-heading text-xl font-bold">Employee sign-in</h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        {restaurantName ? `${restaurantName} — ` : ""}use your phone number and PIN.
      </p>

      <div className="mt-5 space-y-3">
        {!slug && (
          <input
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
            placeholder="Workplace code"
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        )}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Phone number"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          type="password"
          placeholder="PIN"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-guava">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !workplace.trim() || !phone.trim() || !pin.trim()}
          className="w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
