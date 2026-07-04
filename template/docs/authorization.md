# Authorization — RBAC (roles + per-user overrides)

This project uses the **RBAC** flavor of the CASL setup (chosen at scaffold
time; the alternative is a relationship-based ReBAC model).

Three roles (`admin`, `manager`, `member`) with editable rules in the DB and
per-user allow/deny overrides. Deny wins.

## How it works

- Rule storage: `role_permission` (seeded from `defaultRolePermissions` in
  `packages/contracts/src/permissions.ts`) plus per-user
  `user_permission_override` rows. Overrides support **allow and deny; deny
  always wins** (`resolveRules` appends inverted rules last).
- `AbilityFactory` (`apps/api/src/auth/ability.factory.ts`) builds a CASL
  ability per request; rule rows are cached in Redis for 5 minutes and
  invalidated on writes (`invalidateUser` / `invalidateRole`).
- Conditions support the `"${userId}"` placeholder
  (`{ ownerId: "${userId}" }`), interpolated at build time — this is how
  members mutate only what they own.
- Enforcement is two-layered: `@RequireAbility({ action, subject })` for
  coarse route checks (PoliciesGuard),
  `ability.can(action, asSubject("Project", row))` in services for row-level
  checks.
- The web builds **the same ability** from `GET /me/permissions`
  (`apps/web/src/lib/ability.tsx`, `<Can>` / `useAbility()`) to show/hide UI.
  UI gating is cosmetic; the api is the authority.

## Management endpoints

- `PATCH /users/:id/role` — change a user's role (admin).
- `GET|PUT /users/:id/permission-overrides` — per-user grants/denies (admin).
- `GET /me/permissions` — resolved rules for the signed-in user (any user).

## Add / change permissions

- **New subject**: add it to `subjects` in
  `packages/contracts/src/permissions.ts` (the feature generator does this).
- **Role baseline**: edit `defaultRolePermissions`, re-run `pnpm db:seed`
  (resets the role baseline; per-user overrides are untouched). Runtime edits
  go straight into the `role_permission` table — remember
  `AbilityFactory.invalidateRole()` or the 5-minute cache delay applies.
- **Per-user override**: `PUT /users/:id/permission-overrides` with rules
  like `{ action: "delete", subject: "File" }` (grant) or
  `{ ..., inverted: true }` (deny — beats any allow).
- Owner-scoped rules use conditions: `{ ownerId: "${userId}" }`.
