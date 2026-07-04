import { AsyncLocalStorage } from "node:async_hooks";
import type { AppAbility, AuthUser, SessionData } from "@repo/auth";
import { appError } from "./app-error";

export type RequestContext = {
  requestId: string;
  session?: SessionData;
  user?: AuthUser;
  ability?: AppAbility;
};

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
