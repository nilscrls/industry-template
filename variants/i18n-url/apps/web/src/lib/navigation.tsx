"use client";

import { type Locale, SUPPORTED_LOCALES } from "@repo/i18n";
import NextLink from "next/link";
import {
  usePathname as useBrowserPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { useLocale } from "next-intl";
import { type ComponentProps, useMemo } from "react";

type Router = ReturnType<typeof useNextRouter>;

/** True when the first path segment is a supported locale. */
function hasLocalePrefix(path: string): boolean {
  return SUPPORTED_LOCALES.includes(path.split("/")[1] as Locale);
}

/**
 * Prefix an internal absolute path with a locale. Idempotent; external,
 * protocol-relative and relative hrefs pass through untouched.
 */
export function localizeHref(locale: string, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || hasLocalePrefix(href)) {
    return href;
  }
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

/** Strip a locale prefix ("/en/projects" → "/projects", "/en" → "/"). */
export function delocalizePathname(pathname: string): string {
  if (!hasLocalePrefix(pathname)) {
    return pathname;
  }
  return `/${pathname.split("/").slice(2).join("/")}`;
}

/**
 * Drop-in for next/link that prefixes internal string hrefs with the active
 * locale. UrlObject hrefs pass through (none exist in this app); use string
 * hrefs.
 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const localized =
    typeof href === "string" ? localizeHref(locale, href) : href;
  return <NextLink href={localized} {...props} />;
}

/** Drop-in for next/navigation's useRouter: push/replace/prefetch get the active prefix. */
export function useRouter(): Router {
  const router = useNextRouter();
  const locale = useLocale();
  return useMemo<Router>(
    () => ({
      ...router,
      push: (href, options) => router.push(localizeHref(locale, href), options),
      replace: (href, options) =>
        router.replace(localizeHref(locale, href), options),
      prefetch: (href, options) =>
        router.prefetch(localizeHref(locale, href), options),
    }),
    [router, locale]
  );
}

/** Browser pathname without the locale prefix — comparable to the app's unprefixed hrefs. */
export function usePathname(): string {
  return delocalizePathname(useBrowserPathname());
}
