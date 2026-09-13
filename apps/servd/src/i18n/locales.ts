/** Supported locales. Add a new one here + a messages/<code>.json catalog. */
export const LOCALES = ["en", "fil"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fil: "Filipino",
};

export function normalizeLocale(value: string | undefined): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}
