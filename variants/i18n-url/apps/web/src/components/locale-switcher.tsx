"use client";

import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@repo/i18n";
import { Button } from "@repo/ui/components/button";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/lib/navigation";

/**
 * URL-prefix locale switcher: navigates to the same page under the new
 * prefix. Deliberately UI-neutral (Button only, no dropdown primitive):
 * i18n-url is applied after ui-base, so this one file must serve both the
 * Radix and Base UI variants.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  // Raw router on purpose: the target is built fully prefixed right here.
  const router = useRouter();
  const pathname = usePathname(); // locale-stripped
  const t = useTranslations("shell");

  function setLocale(next: string) {
    if (next === locale) {
      return;
    }
    // Preference hint: the middleware uses it to prefix bare deep links.
    // biome-ignore lint/suspicious/noDocumentCookie: single first-party preference cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const suffix = pathname === "/" ? "" : pathname;
    router.push(`/${next}${suffix}${window.location.search}`);
  }

  return (
    <div
      aria-label={t("changeLocale")}
      className="flex items-center"
      role="group"
    >
      {SUPPORTED_LOCALES.map((candidate) => (
        <Button
          aria-pressed={candidate === locale}
          key={candidate}
          onClick={() => setLocale(candidate)}
          size="sm"
          variant={candidate === locale ? "secondary" : "ghost"}
        >
          {candidate.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
