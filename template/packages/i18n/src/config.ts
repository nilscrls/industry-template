export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Set by `create-industry-app` from the language chosen at scaffold time. */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Request header carrying the canonical locale in the URL-prefixed i18n
 * variant (`--i18n=url`): the middleware strips `/en|/fr` from the pathname
 * and forwards the value here for `src/i18n/request.ts`.
 */
export const LOCALE_HEADER = "x-locale";

/** Narrow an untrusted value (cookie, header) to a supported locale. */
export function resolveLocale(requested: string | undefined): Locale {
  return SUPPORTED_LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : DEFAULT_LOCALE;
}
