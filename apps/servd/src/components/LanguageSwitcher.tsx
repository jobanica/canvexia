"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/locales";
import { setLocale } from "@/app/i18n-actions";

/** Diner-facing language selector. Persists the choice via a cookie. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Language"
      defaultValue={locale}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          await setLocale(value);
          router.refresh();
        });
      }}
      className="rounded-full border border-brand-ink/15 bg-transparent px-2 py-1 text-xs"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
