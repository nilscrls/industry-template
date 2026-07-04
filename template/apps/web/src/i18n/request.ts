import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Cookie-based locale — no locale prefix in URLs for this app-style UI. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = SUPPORTED_LOCALES.includes(requested as Locale) ? (requested as Locale) : "en";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
