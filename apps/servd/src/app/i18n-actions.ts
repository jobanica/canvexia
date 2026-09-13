"use server";

import { cookies } from "next/headers";
import { normalizeLocale } from "@/i18n/locales";

/** Persists the chosen language in a cookie (read by src/i18n/request.ts). */
export async function setLocale(value: string): Promise<void> {
  const locale = normalizeLocale(value);
  const store = await cookies();
  store.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
