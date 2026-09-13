import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { normalizeLocale } from "./locales";

/**
 * Cookie-based locale (no URL routing). The `locale` cookie is set by the
 * language switcher; we default to English. Messages are loaded per request.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = normalizeLocale(store.get("locale")?.value);
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
