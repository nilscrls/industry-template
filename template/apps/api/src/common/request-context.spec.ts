import type { AuthUser, SessionData } from "@repo/auth";
import { describe, expect, it } from "vitest";
import {
  activeOrganizationId,
  currentRequestId,
  currentUser,
  requestContext,
} from "./request-context";

const user = { id: "u1", email: "a@example.com" } as unknown as AuthUser;

function withSession(activeOrg: string | null): SessionData {
  return {
    session: { activeOrganizationId: activeOrg },
  } as unknown as SessionData;
}

describe("currentRequestId", () => {
  it("is undefined outside a request scope", () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it("returns the id inside the scope", () => {
    requestContext.run({ requestId: "req-1" }, () => {
      expect(currentRequestId()).toBe("req-1");
    });
  });
});

describe("currentUser", () => {
  it("throws AUTH_UNAUTHORIZED when there is no user", () => {
    let code: unknown;
    try {
      requestContext.run({ requestId: "r" }, () => currentUser());
    } catch (error) {
      code = (error as { data?: { code?: string } }).data?.code;
    }
    expect(code).toBe("AUTH_UNAUTHORIZED");
  });

  it("returns the authenticated user", () => {
    requestContext.run({ requestId: "r", user }, () => {
      expect(currentUser()).toBe(user);
    });
  });
});

describe("activeOrganizationId", () => {
  it("is null outside a request scope", () => {
    expect(activeOrganizationId()).toBeNull();
  });

  it("is null for a session with no active organization", () => {
    requestContext.run({ requestId: "r", session: withSession(null) }, () => {
      expect(activeOrganizationId()).toBeNull();
    });
  });

  it("returns the active organization id from the session", () => {
    requestContext.run(
      { requestId: "r", session: withSession("org-9") },
      () => {
        expect(activeOrganizationId()).toBe("org-9");
      }
    );
  });
});
