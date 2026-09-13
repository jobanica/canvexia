"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const [showPassword, setShowPassword] = useState(false);
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
        <div>
          <label className="block text-sm font-medium" htmlFor="password">
            {t("password")}
          </label>
          <div className="relative mt-1">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold text-plum-ink/50 hover:text-plum-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-primary">
            Forgot password?
          </Link>
        </div>

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

      <div className="mt-6 text-center">
        <Link href="/super-admin" className="text-xs font-medium text-plum-ink/40 hover:text-plum-ink">
          Platform admin
        </Link>
      </div>
    </div>
  );
}
