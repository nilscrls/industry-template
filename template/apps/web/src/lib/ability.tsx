"use client";

import { type AppAbility, buildAbility } from "@repo/auth/ability";
import type { Action, AppSubject } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
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

  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  );
}

export function useAbility(): AppAbility | null {
  return useContext(AbilityContext);
}

interface CanProps {
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
  subject: AppSubject | Record<PropertyKey, unknown>;
}

/** Renders children only when the current user can `action` the `subject`. */
export function Can({ action, subject, children, fallback = null }: CanProps) {
  const ability = useAbility();
  return ability?.can(action, subject) ? children : fallback;
}
