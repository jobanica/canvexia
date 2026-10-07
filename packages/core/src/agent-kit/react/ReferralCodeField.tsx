"use client";

import { useEffect, useState } from "react";

/**
 * The referral code input for a product's signup form.
 *
 * Checks the code as it is typed against `lookupPath` — an endpoint on the
 * PRODUCT that calls the portal with the product's secret (`lookupAgentCode`).
 * The browser never talks to the portal and never sees the secret.
 *
 * Purely advisory. The portal decides attachment when it processes the signup
 * event; this only tells the customer what will happen, so a typo is caught
 * while they are still on the form.
 */
type Lookup =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "ok"; agentName: string }
  | { state: "inactive" }
  | { state: "unknown" }
  | { state: "unavailable" };

export function ReferralCodeField({
  name = "agentCode",
  defaultValue = "",
  lookupPath,
  label = "Referral code (optional)",
  inputClassName = "mt-1 w-full rounded-lg border px-3 py-2 uppercase",
  labelClassName = "block text-sm font-medium",
}: {
  name?: string;
  defaultValue?: string;
  /** e.g. "/api/agent-code" — the code is appended as a path segment. */
  lookupPath: string;
  label?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const [code, setCode] = useState(defaultValue);
  const [lookup, setLookup] = useState<Lookup>({ state: "empty" });

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setLookup({ state: "empty" });
      return;
    }
    setLookup({ state: "checking" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${lookupPath}/${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
        if (!res.ok) return setLookup({ state: "unavailable" });
        const j = (await res.json()) as { valid: boolean; active: boolean; agent_name: string | null };
        if (j.valid && j.active && j.agent_name) setLookup({ state: "ok", agentName: j.agent_name });
        else if (j.valid) setLookup({ state: "inactive" });
        else setLookup({ state: "unknown" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setLookup({ state: "unavailable" });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [code, lookupPath]);

  return (
    <div>
      <label className={labelClassName} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={20}
        className={inputClassName}
      />
      <p aria-live="polite" className="mt-1 min-h-[1.25rem] text-xs">
        {lookup.state === "checking" && <span className="opacity-60">Checking…</span>}
        {lookup.state === "ok" && <span className="text-emerald-700">Referred by {lookup.agentName}</span>}
        {lookup.state === "inactive" && <span className="text-amber-700">This code isn&apos;t active right now.</span>}
        {lookup.state === "unknown" && <span className="text-red-700">We don&apos;t recognise that code.</span>}
      </p>
    </div>
  );
}
