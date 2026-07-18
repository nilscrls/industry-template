/**
 * Navigation shim — always import `Link`, `useRouter` and `usePathname` from
 * here instead of `next/link` / `next/navigation`. The default (cookie
 * locale) build is a plain re-export; the `--i18n=url` variant swaps this
 * single file for locale-prefixing wrappers, so pages never change.
 *
 * Locale-agnostic APIs (`useSearchParams`, server-side `redirect`) stay on
 * `next/navigation`: the url-variant middleware canonicalizes any unprefixed
 * redirect target with one extra hop.
 */
export { default as Link } from "next/link";
export { usePathname, useRouter } from "next/navigation";
