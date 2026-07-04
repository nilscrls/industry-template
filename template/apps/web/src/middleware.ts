import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/**
 * Fast redirect UX only — cookie presence is a hint, not proof. Real
 * enforcement lives in the API (AuthGuard) on every request.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name)
  );
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!(hasSessionCookie || isPublic)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") {
      login.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(login);
  }
  if (hasSessionCookie && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
