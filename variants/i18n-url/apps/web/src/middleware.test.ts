// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function request(
  path: string,
  cookies: Record<string, string> = {}
): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

const SIGNED_IN = { "better-auth.session_token": "x" };

function location(res: Response): URL {
  return new URL(res.headers.get("location") ?? "");
}

describe("middleware (url locale)", () => {
  it("redirects a bare path to the default-locale prefix", () => {
    const res = middleware(request("/dashboard", SIGNED_IN));
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/en/dashboard");
  });

  it("honors the NEXT_LOCALE preference cookie on bare paths", () => {
    const res = middleware(request("/dashboard", { NEXT_LOCALE: "fr" }));
    expect(location(res).pathname).toBe("/fr/dashboard");
  });

  it("keeps the query string through the canonical redirect", () => {
    const res = middleware(request("/projects?page=2", SIGNED_IN));
    expect(location(res).search).toBe("?page=2");
  });

  it("rewrites a prefixed path to the unprefixed tree with x-locale", () => {
    const res = middleware(request("/fr/projects?page=2", SIGNED_IN));
    const rewrite = res.headers.get("x-middleware-rewrite") ?? "";
    expect(new URL(rewrite).pathname).toBe("/projects");
    expect(new URL(rewrite).search).toBe("?page=2");
    expect(res.headers.get("x-middleware-request-x-locale")).toBe("fr");
  });

  it("rewrites the locale root to /", () => {
    const res = middleware(request("/en", SIGNED_IN));
    expect(new URL(res.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(
      "/"
    );
  });

  it("sends a signed-out visitor to the same-locale login with a prefixed next", () => {
    const res = middleware(request("/fr/projects"));
    expect(location(res).pathname).toBe("/fr/login");
    expect(location(res).searchParams.get("next")).toBe("/fr/projects");
  });

  it("bounces a signed-in user off auth pages within their locale", () => {
    const res = middleware(request("/fr/login", SIGNED_IN));
    expect(location(res).pathname).toBe("/fr/dashboard");
  });

  it("rewrites public pages without an auth check", () => {
    const res = middleware(request("/en/legal/privacy"));
    expect(res.headers.get("location")).toBeNull();
    expect(
      new URL(res.headers.get("x-middleware-rewrite") ?? "").pathname
    ).toBe("/legal/privacy");
  });
});
