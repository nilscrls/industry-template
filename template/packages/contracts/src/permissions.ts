import * as z from "zod";

export const actions = ["manage", "create", "read", "update", "delete"] as const;
export const subjects = ["Project", "User", "File", "all"] as const;
export const roles = ["admin", "manager", "member"] as const;

export type Action = (typeof actions)[number];
export type AppSubject = (typeof subjects)[number];
export type Role = (typeof roles)[number];

export const roleSchema = z.enum(roles);

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

/** Baseline rules per role — seeded into the database, editable at runtime. */
export const defaultRolePermissions: Record<Role, PermissionRule[]> = {
  admin: [{ action: "manage", subject: "all" }],
  manager: [
    { action: "manage", subject: "Project" },
    { action: "manage", subject: "File" },
    { action: "read", subject: "User" },
  ],
  member: [
    { action: "read", subject: "Project" },
    { action: "create", subject: "Project" },
    { action: "update", subject: "Project", conditions: { ownerId: "${userId}" } },
    { action: "delete", subject: "Project", conditions: { ownerId: "${userId}" } },
    { action: "create", subject: "File" },
    { action: "read", subject: "File", conditions: { ownerId: "${userId}" } },
    { action: "delete", subject: "File", conditions: { ownerId: "${userId}" } },
  ],
};
