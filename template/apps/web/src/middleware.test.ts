// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

const SESSION = "better-auth.session_token=x";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

function location(res: Response): URL {
  return new URL(res.headers.get("location") ?? "");
}

describe("middleware (cookie locale)", () => {
  it("redirects a signed-out visitor to /login with next", () => {
    const res = middleware(request("/projects"));
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("next")).toBe("/projects");
  });

  it("omits next for the root path", () => {
    expect(location(middleware(request("/"))).search).toBe("");
  });

  it("lets a signed-in user through", () => {
    const res = middleware(request("/projects", SESSION));
    expect(res.headers.get("location")).toBeNull();
  });

  it("bounces a signed-in user off auth pages", () => {
    const res = middleware(request("/login", SESSION));
    expect(location(res).pathname).toBe("/dashboard");
  });

  it("leaves public pages alone", () => {
    expect(
      middleware(request("/legal/privacy")).headers.get("location")
    ).toBeNull();
  });
});
