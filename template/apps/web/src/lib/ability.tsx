"use client";

import { buildAbility, type AppAbility } from "@repo/auth/ability";
import type { Action, AppSubject } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { orpc } from "./api";
import { authClient } from "./auth-client";

const AbilityContext = createContext<AppAbility | null>(null);

/**
 * Builds the SAME CASL ability the api enforces, from /me/permissions.
 * UI gating only — the api re-checks everything.
 */
export function AbilityProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const { data } = useQuery({
    ...orpc.me.permissions.queryOptions(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const ability = useMemo(() => {
    if (!(session && data)) {
      return null;
    }
    return buildAbility(data.rules, { userId: session.user.id });
  }, [session, data]);

  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

export function useAbility(): AppAbility | null {
  return useContext(AbilityContext);
}

type CanProps = {
  action: Action;
  subject: AppSubject | Record<PropertyKey, unknown>;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Renders children only when the current user can `action` the `subject`. */
export function Can({ action, subject, children, fallback = null }: CanProps) {
  const ability = useAbility();
  return ability?.can(action, subject) ? children : fallback;
}
