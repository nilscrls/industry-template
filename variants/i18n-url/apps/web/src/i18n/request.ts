import { getMessages, LOCALE_HEADER, resolveLocale } from "@repo/i18n";
import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/**
 * URL-prefixed locale — the middleware strips `/en|/fr` from the pathname and
 * forwards the canonical value in the `x-locale` header. Absent header
 * (build-time prerender, e.g. /_not-found) falls back to the default locale.
 */
export default getRequestConfig(async () => {
  const store = await headers();
  const locale = resolveLocale(store.get(LOCALE_HEADER) ?? undefined);
  return {
    locale,
    messages: await getMessages(locale),
  };
});
