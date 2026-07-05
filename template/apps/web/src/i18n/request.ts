import { getMessages, LOCALE_COOKIE, resolveLocale } from "@repo/i18n";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/** Cookie-based locale — no locale prefix in URLs for this app-style UI. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: await getMessages(locale),
  };
});
