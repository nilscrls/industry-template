import { type CustomDecorator, SetMetadata } from "@nestjs/common";
import type { OrgCapability, SystemCapability } from "@repo/contracts";

export const IS_PUBLIC_KEY = "isPublic";
export const PERMISSION_KEY = "requiredPermissions";

/** Skip authentication (health probes, OpenAPI spec, …). */
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export type PermissionRequirement =
  | { relation: OrgCapability; scope: "org" }
  | { relation: SystemCapability; scope: "system" };

/**
 * Coarse, route-level authorization: an OpenFGA capability check against
 * the active organization (`scope: "org"`) or the `system:global` singleton
 * (`scope: "system"`, cross-tenant admin surfaces). Row-level checks belong
 * in services via `fga.check(fga.me(), "can_update", fga.ref.project(id))`.
 *
 * Org-scoped routes with NO active organization pass the guard — services
 * answer with empty lists (fresh users see nothing, never 403).
 */
export const RequirePermission = (
  ...requirements: PermissionRequirement[]
): CustomDecorator<string> => SetMetadata(PERMISSION_KEY, requirements);
