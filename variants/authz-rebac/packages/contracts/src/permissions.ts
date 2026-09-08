import { z } from "zod";

/**
 * Authorization vocabulary (ReBAC variant). The rules themselves live in
 * the OpenFGA model (`packages/fga/model.fga`) — this file only names the
 * capabilities and relations so contracts, guards and the web app share
 * one typed list.
 */
export const roles = ["admin", "user"] as const;
export type Role = (typeof roles)[number];
export const roleSchema = z.enum(roles);

/** Resource types in the FGA model (kept in sync by `pnpm gen feature`). */
export const resources = ["project", "file"] as const;
export type Resource = (typeof resources)[number];

/**
 * Per-project relations — the ReBAC ladder. Every owner is an editor,
 * every editor a viewer (see the model).
 */
export const projectRelations = ["owner", "editor", "viewer"] as const;
export type ProjectRelation = (typeof projectRelations)[number];
export const projectRelationSchema = z.enum(projectRelations);

/** Org-scoped capabilities, checked against `org:<activeOrganizationId>`. */
export const orgCapabilities = [
  "can_read_project",
  "can_create_project",
  "can_read_file",
  "can_create_file",
  "can_read_all_files",
  "can_read_audit_log",
  "can_manage_feature_flag",
  "can_manage_wallet",
] as const;
export type OrgCapability = (typeof orgCapabilities)[number];

/** Cross-tenant admin capabilities, checked against `system:global`. */
export const systemCapabilities = [
  "can_read_user",
  "can_manage_user",
  "can_manage_organization",
] as const;
export type SystemCapability = (typeof systemCapabilities)[number];

/**
 * The signed-in user's capability snapshot — computed server-side with FGA
 * ListRelations and consumed by the web app for UI gating (cosmetic; the
 * api re-checks everything).
 */
export const permissionSnapshotSchema = z.object({
  org: z.array(z.enum(orgCapabilities)),
  system: z.array(z.enum(systemCapabilities)),
});
export type PermissionSnapshot = z.infer<typeof permissionSnapshotSchema>;
