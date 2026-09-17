"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { signIn } from "./actions";
import { PasswordField } from "@/components/auth/PasswordField";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const t = useTranslations("auth");

  return (
    <div className="mx-auto max-w-sm px-6 pt-16">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <AppIcon size={32} />
        <Wordmark size="1.4rem" />
      </Link>
      <h1 className="font-heading text-2xl font-bold">{t("loginTitle")}</h1>
      <p className="mt-1 text-sm text-plum-ink/60">{t("loginSubtitle")}</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="email">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="text"
            required
            autoComplete="username"
            placeholder="Email or username"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        {/*
          One component with the rest of the doors. This screen already had a
          toggle and a link; they were hand-rolled here, which is how HQ ended
          up with one and the partner portal with the other.
        */}
        <PasswordField
          label={t("password")}
          forgotHref="/forgot-password"
          labelClassName="block text-sm font-medium"
          inputClassName="border-plum-ink/15"
          toggleClassName="text-plum-ink/50 hover:text-plum-ink"
        />

        {state?.error && (
          <p className="text-sm text-guava">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? t("signingIn") : t("signIn")}
        </button>
      </form>

      {/*
        The two other doors into this deployment. This form is for restaurant
        staff — it says so — and the people who run the platform or a territory
        have their own, CANVEXIA-branded, with their own landing page. Pointing
        "Platform admin" at /super-admin sent them into one product's back
        office instead of the console above it.
      */}
      <div className="mt-6 flex items-center justify-center gap-4 text-xs font-medium text-plum-ink/40">
        <Link href="/hq/login" className="hover:text-plum-ink">
          CANVEXIA HQ
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/partner/login" className="hover:text-plum-ink">
          Partner portal
        </Link>
      </div>
    </div>
  );
}
