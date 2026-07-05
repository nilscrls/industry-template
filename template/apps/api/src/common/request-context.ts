import { AsyncLocalStorage } from "node:async_hooks";
import type { AppAbility, AuthUser, SessionData } from "@repo/auth";
import { appError } from "./app-error";

export interface RequestContext {
  ability?: AppAbility;
  requestId: string;
  session?: SessionData;
  user?: AuthUser;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/** The authenticated user — only callable behind the AuthGuard. */
export function currentUser(): AuthUser {
  const user = requestContext.getStore()?.user;
  if (!user) {
    throw appError("AUTH_UNAUTHORIZED", {});
  }
  return user;
}

export function currentAbility(): AppAbility {
  const ability = requestContext.getStore()?.ability;
  if (!ability) {
    throw appError("AUTH_UNAUTHORIZED", {});
  }
  return ability;
}

/**
 * The organization the session currently acts within, or null when the user
 * belongs to no organization. Callers must treat null as "sees nothing"
 * (empty lists), never as an error — fresh users get empty lists, not 403s.
 */
export function activeOrganizationId(): string | null {
  const session = requestContext.getStore()?.session;
  return session?.session.activeOrganizationId ?? null;
}
