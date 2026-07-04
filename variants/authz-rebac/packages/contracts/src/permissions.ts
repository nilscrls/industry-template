import { z } from "zod";

export const actions = [
  "manage",
  "create",
  "read",
  "update",
  "delete",
] as const;
export const subjects = ["Project", "User", "File", "all"] as const;
export const roles = ["admin", "member"] as const;
export const projectRelations = ["owner", "editor", "viewer"] as const;

export type Action = (typeof actions)[number];
export type AppSubject = (typeof subjects)[number];
export type Role = (typeof roles)[number];
export type ProjectRelation = (typeof projectRelations)[number];

export const roleSchema = z.enum(roles);
export const projectRelationSchema = z.enum(projectRelations);

/**
 * A serializable CASL rule. `conditions` values support the `"${userId}"`
 * placeholder, interpolated by the shared ability factory at build time.
 * `inverted: true` is a deny rule — deny always wins over allow.
 */
export const permissionRuleSchema = z.object({
  action: z.enum(actions),
  subject: z.enum(subjects),
  conditions: z.record(z.string(), z.unknown()).optional(),
  inverted: z.boolean().optional(),
});

export type PermissionRule = z.infer<typeof permissionRuleSchema>;

/** Actions each relation grants on the projects it covers (ReBAC). */
export const relationActions: Record<ProjectRelation, readonly Action[]> = {
  owner: ["manage"],
  editor: ["read", "update"],
  viewer: ["read"],
};

/** Rules every authenticated user gets, regardless of relationships. */
export const baselinePermissions: PermissionRule[] = [
  { action: "create", subject: "Project" },
  { action: "create", subject: "File" },
  { action: "read", subject: "File", conditions: { ownerId: "${userId}" } },
  { action: "delete", subject: "File", conditions: { ownerId: "${userId}" } },
];

/** Site admins bypass relationship checks entirely. */
export const adminPermissions: PermissionRule[] = [
  { action: "manage", subject: "all" },
];

export interface ProjectMembership {
  projectId: string;
  relation: ProjectRelation;
}

/**
 * Turn membership tuples into serializable CASL rules: one rule per
 * (relation, action) pair, scoped with `{ id: { $in: [...projectIds] } }`.
 * The same rules flow to the web app via `GET /me/permissions`.
 */
export function rulesFromMemberships(
  memberships: ProjectMembership[]
): PermissionRule[] {
  const idsByRelation = new Map<ProjectRelation, string[]>();
  for (const membership of memberships) {
    const ids = idsByRelation.get(membership.relation) ?? [];
    ids.push(membership.projectId);
    idsByRelation.set(membership.relation, ids);
  }
  return projectRelations.flatMap((relation) => {
    const ids = idsByRelation.get(relation);
    if (!ids || ids.length === 0) {
      return [];
    }
    return relationActions[relation].map((action) => ({
      action,
      subject: "Project" as const,
      conditions: { id: { $in: ids } },
    }));
  });
}
