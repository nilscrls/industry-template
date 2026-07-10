"use client";

import type {
  OrgCapability,
  PermissionSnapshot,
  SystemCapability,
} from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { orpc } from "./api";
import { authClient } from "./auth-client";

type Capability = OrgCapability | SystemCapability;

const PermissionsContext = createContext<Set<Capability> | null>(null);

/**
 * The capability snapshot computed server-side from OpenFGA
 * (`GET /me/permissions`). UI gating only — the api re-checks everything.
 * Row-level decisions (edit/delete per row) ride on the DTOs instead
 * (`project.canUpdate` / `project.canDelete`).
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const { data } = useQuery({
    ...orpc.me.permissions.queryOptions(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const capabilities = useMemo(() => {
    if (!(session && data)) {
      return null;
    }
    const snapshot = data as PermissionSnapshot;
    return new Set<Capability>([...snapshot.org, ...snapshot.system]);
  }, [session, data]);

  return (
    <PermissionsContext.Provider value={capabilities}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): Set<Capability> | null {
  return useContext(PermissionsContext);
}

/** True once the snapshot is loaded AND grants the capability. */
export function useCan(capability: Capability): boolean {
  return usePermissions()?.has(capability) ?? false;
}

interface CanProps {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders children only when the current user holds `capability`. */
export function Can({ capability, children, fallback = null }: CanProps) {
  return useCan(capability) ? children : fallback;
}
