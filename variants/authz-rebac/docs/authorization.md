# Authorization — ReBAC (per-resource memberships)

This project uses the **ReBAC** flavor of the CASL setup (chosen at scaffold
time; the alternative is a role-matrix RBAC model).

Access to a project is a **relation** held by a user on that specific
project: `owner`, `editor` or `viewer`. There are only two global roles —
`admin` (bypasses relationship checks entirely) and `member` (everyone else).

Underneath the application layer, **Postgres row-level security** enforces
tenant isolation as defense in depth: org-scoped tables (`project`,
`file_object`, `audit_log`, `member`, `invitation`) carry policies matching
`current_setting('app.current_org_id')`, set per request by
`DbService.tenant(...)` (SET LOCAL inside a transaction). The API connects
as the restricted `app_user` role; a query that forgets its WHERE clause
returns zero foreign rows instead of leaking them. Better-Auth uses the
`app_auth` BYPASSRLS role (it reads `member` before a tenant exists);
migrations/seeds run as the owner. See `packages/db/src/schema/roles.ts`.

## How it works

- Relationship tuples live in the `project_member` table
  (`projectId, userId, relation`). Creating a project inserts the creator's
  `owner` tuple in the same transaction — ownership IS the grant.
- `relationActions` in `packages/contracts/src/permissions.ts` maps each
  relation to the actions it grants: owner → `manage`, editor →
  `read, update`, viewer → `read`.
- `AbilityFactory` (`apps/api/src/auth/ability.factory.ts`) loads the user's
  memberships and turns them into serializable CASL rules
  (`{ id: { $in: [...projectIds] } }` conditions) via `rulesFromMemberships`,
  merged with `baselinePermissions` (create Project/File, own-file access).
  Rules are cached in Redis for 5 minutes and invalidated on every
  membership write (`invalidateUser`).
- Listing is scoped in the service: non-admins only see projects they hold a
  relation on (`/projects` joins against `project_member`). A user with no
  memberships gets an empty list, not a 403 — that's why `list`/`find` carry
  no coarse `@RequireAbility` guard; the row-level `ability.can(...)` checks
  in the service are the authority.
- The web builds **the same ability** from `GET /me/permissions`
  (`apps/web/src/lib/ability.tsx`, `<Can>` / `useAbility()`) to show/hide UI.
  UI gating is cosmetic; the api is the authority.

## Management endpoints

- `GET /projects/:id/members` — list members (anyone who can read the project).
- `PUT /projects/:id/members/:userId` `{ relation }` — grant or change a
  relation (requires `manage`: the owner relation or admin). A project always
  keeps at least one owner — demoting or removing the last owner is rejected.
- `DELETE /projects/:id/members/:userId` — revoke access.
- `PATCH /users/:id/role` — promote/demote site admins (admin only).
- `GET /me/permissions` — resolved rules for the signed-in user.

## Add / change permissions

- **New subject**: add it to `subjects` in
  `packages/contracts/src/permissions.ts` (the feature generator does this).
  Then decide whether the new resource is relationship-scoped (add its own
  membership table + rules, mirroring projects) or baseline/ownership-scoped
  (add rules to `baselinePermissions`, e.g. with
  `{ ownerId: "${userId}" }` conditions like File).
- **Change what a relation grants**: edit `relationActions` — it applies on
  the next ability rebuild (≤ 5 min cache, or immediately after a membership
  write for that user).
- **Grant/revoke access to a project**: use the members endpoints above —
  no deploy, no seed, it's data.
