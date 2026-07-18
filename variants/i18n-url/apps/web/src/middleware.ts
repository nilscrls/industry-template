import {
  type Locale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "@repo/i18n";
import { type NextRequest, NextResponse } from "next/server";

/** Auth pages: public, but a signed-in user is bounced to the app. */
const AUTH_PATHS = ["/login", "/register", "/two-factor"];
/** Truly public pages: reachable signed-in or signed-out. */
const PUBLIC_PATHS = ["/changelog", "/legal"];
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/** Split "/fr/projects" into its locale prefix and the app-internal path. */
function splitLocale(pathname: string): {
  locale: Locale | undefined;
  rest: string;
} {
  const [, first = "", ...tail] = pathname.split("/");
  if (!SUPPORTED_LOCALES.includes(first as Locale)) {
    return { locale: undefined, rest: pathname };
  }
  return { locale: first as Locale, rest: `/${tail.join("/")}` };
}

/**
 * URL-prefixed locale (`/en/…`, `/fr/…`) without a `[locale]` route segment:
 * the prefix is stripped here with a rewrite and the canonical locale rides
 * to `src/i18n/request.ts` in the `x-locale` request header. Session-cookie
 * presence is a hint, not proof — real enforcement lives in the API
 * (AuthGuard) on every request.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  // Canonical URLs are always prefixed. Bare paths redirect to the visitor's
  // preferred locale (NEXT_LOCALE cookie, written by the switcher) or the
  // scaffold-time default.
  if (!locale) {
    const preferred = resolveLocale(request.cookies.get(LOCALE_COOKIE)?.value);
    const suffix = pathname === "/" ? "" : pathname;
    return NextResponse.redirect(
      new URL(`/${preferred}${suffix}${search}`, request.url)
    );
  }

  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name)
  );
  const isPublic = PUBLIC_PATHS.some((path) => rest.startsWith(path));
  const isAuthPage = AUTH_PATHS.some((path) => rest.startsWith(path));

  if (!(isPublic || hasSessionCookie || isAuthPage)) {
    const login = new URL(`/${locale}/login`, request.url);
    if (rest !== "/") {
      // Prefixed form, so the post-login push lands on the same locale.
      login.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(login);
  }
  if (!isPublic && hasSessionCookie && isAuthPage) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Serve the unprefixed route tree; the browser URL keeps the prefix.
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  return NextResponse.rewrite(new URL(`${rest}${search}`, request.url), {
    request: { headers },
  });
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
