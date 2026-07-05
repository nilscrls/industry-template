---
paths:
  - "packages/contracts/src/permissions.ts"
  - "packages/auth/**"
  - "apps/api/src/auth/**"
  - "packages/db/src/schema/permissions.ts"
---

# Authorization — RBAC (this scaffold's model)

- Roles are global: `admin`, `manager`, `member`
  (`packages/contracts/src/permissions.ts`). `defaultRolePermissions` holds
  the baseline serializable CASL rules per role — seeded into the database
  and editable at runtime, so changing the constant only affects fresh
  seeds, not existing databases.
- Rules are serializable `PermissionRule` objects (`action`, `subject`,
  optional `conditions`, optional `inverted`). Condition values support the
  `"${userId}"` placeholder, interpolated by the shared ability factory.
  `inverted: true` is a deny rule and deny always wins.
- The same rules flow to the web app (`GET /me/permissions`) — never
  implement a permission check that exists only on one side.
- New entity (via `pnpm gen feature`): the generator adds the subject to
  `subjects`; you must still grant it in `defaultRolePermissions` (and/or
  seeds) or every non-admin gets 403. See `docs/authorization.md`.
- Guard mutating endpoints with `@RequireAbility({ action, subject })`;
  scope list/read results in the service query instead of guarding coarsely
  — a user with no access must get an empty list, not a 403.
