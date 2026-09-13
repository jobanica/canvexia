"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { signUpRestaurant, type SignupState } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(
    signUpRestaurant,
    null,
  );
  const t = useTranslations("auth");

  if (state?.ok) {
    return (
      <div className="mx-auto max-w-sm px-6 pt-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
          ✓
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold">{t("checkEmail")}</h1>
        <p className="mt-2 text-sm text-plum-ink/60">{t("checkEmailBody")}</p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand-primary">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 pt-16">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <AppIcon size={32} />
        <Wordmark size="1.4rem" />
      </Link>
      <h1 className="font-heading text-2xl font-bold">{t("signupTitle")}</h1>
      <p className="mt-1 text-sm text-plum-ink/60">{t("signupSubtitle")}</p>

      <div className="mt-4 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-sm text-plum-ink/75">
        <span className="font-semibold text-brand-primary">✨ 30-day free trial</span> — every
        feature unlocked, no card. After 30 days you move to the Free plan unless you upgrade.
      </div>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="restaurantName">
            {t("restaurantName")}
          </label>
          <input
            id="restaurantName"
            name="restaurantName"
            required
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="phone">
            {t("phone")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="email">
            {t("yourEmail")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="password">
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>

        {state?.error && <p className="text-sm text-guava">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? t("creating") : t("createAccount")}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-plum-ink/50">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-brand-primary">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
