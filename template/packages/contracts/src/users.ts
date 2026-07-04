import { z } from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";
import { permissionRuleSchema, roleSchema } from "./permissions.js";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  role: roleSchema,
  createdAt: z.iso.datetime(),
});

export type User = z.infer<typeof userSchema>;

export const usersContract = {
  list: base
    .route({
      method: "GET",
      path: "/users",
      summary: "List users (admin)",
      tags: ["users"],
    })
    .input(
      paginationQuerySchema.extend({ search: z.string().max(255).optional() })
    )
    .output(paginatedSchema(userSchema)),

  setRole: base
    .route({
      method: "PATCH",
      path: "/users/{id}/role",
      summary: "Change a user's role",
      tags: ["users"],
    })
    .input(z.object({ id: z.string(), role: roleSchema }))
    .output(userSchema),

  getPermissionOverrides: base
    .route({
      method: "GET",
      path: "/users/{id}/permission-overrides",
      summary: "Read per-user permission overrides",
      tags: ["users"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ overrides: z.array(permissionRuleSchema) })),

  setPermissionOverrides: base
    .route({
      method: "PUT",
      path: "/users/{id}/permission-overrides",
      summary: "Replace per-user permission overrides",
      tags: ["users"],
    })
    .input(
      z.object({ id: z.string(), overrides: z.array(permissionRuleSchema) })
    )
    .output(z.object({ overrides: z.array(permissionRuleSchema) })),
};

export const meContract = {
  /** Fully resolved rules (role defaults ⊕ overrides, placeholders interpolated). */
  permissions: base
    .route({
      method: "GET",
      path: "/me/permissions",
      summary: "My effective permissions",
      tags: ["me"],
    })
    .output(z.object({ rules: z.array(permissionRuleSchema) })),
};
