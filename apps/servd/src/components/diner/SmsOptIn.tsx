"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { submitSmsOptIn } from "@/server/sms/optin";

/**
 * Diner marketing opt-in. ALWAYS optional. The consent checkbox is UNCHECKED by
 * default, is not bundled with any terms, and states who sends / what / how
 * often / how to stop. Incentivizing an SMS signup is fine (kept separate from
 * the review ask).
 */
export function SmsOptIn({
  slug,
  restaurantName,
  source,
}: {
  slug: string;
  restaurantName: string;
  source: "payment_screen" | "feedback_screen";
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const t = useTranslations("sms");

  async function handle() {
    setBusy(true);
    setMsg(null);
    const res = await submitSmsOptIn({ slug, phone, name, source, consent });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setMsg(res.message ?? "Thanks!");
    } else {
      setMsg(res.error ?? "Couldn't sign you up.");
    }
  }

  if (done) {
    return <p className="text-sm font-semibold text-brand-primary">✓ {msg}</p>;
  }

  return (
    <div>
      <p className="font-heading font-bold text-brand-ink">{t("incentive")}</p>
      <div className="mt-3 space-y-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="09XX XXX XXXX"
          className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        {/* Unchecked by default, standalone consent — not bundled with terms. */}
        <label className="flex items-start gap-2 text-xs text-brand-ink/70">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t("consent", { name: restaurantName })}</span>
        </label>
      </div>
      {msg && <p className="mt-2 text-xs text-guava">{msg}</p>}
      <button
        onClick={handle}
        disabled={busy || !consent || phone.trim().length < 7}
        className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
      >
        {busy ? t("signingUp") : t("signup")}
      </button>
    </div>
  );
}
