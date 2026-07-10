# Authorization — ReBAC (per-resource relations) on OpenFGA

This project uses the **ReBAC** flavor of the OpenFGA setup (chosen at
scaffold time; the alternative is a role-matrix RBAC model).

Access to a project is a **relation** held by a user on that specific
project: `owner`, `editor` or `viewer` (a ladder — every owner is an
editor, every editor a viewer). There are only two global roles — `admin`
(bypasses relations entirely) and `member`.

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

- **The model** lives in `packages/fga/model.fga` (OpenFGA DSL). The
  project type defines the relation ladder and the `can_*` capabilities
  derived from it (`can_read: viewer or admin from org`, `can_update:
  editor or admin from org`, `can_delete` / `can_manage_members`: owner or
  admin).
- **`project_member` is the DB source of truth** for relations; every
  membership write mirrors into an FGA tuple in the same request (row
  first, tuple after commit). Project creation grants the creator `owner`
  in both places. `pnpm fga:sync` rebuilds every derived tuple from the DB.
- Enforcement is two-layered: `@RequirePermission({relation, scope})` for
  coarse route checks (org capabilities / `system:global` admin surface),
  and `fga.check(fga.me(), "can_update", fga.ref.project(id))` in services
  for row-level checks against the relation ladder.
- Listing stays a DB join on `project_member` (pageable, index-friendly);
  FGA re-answers the same question per row for the DTO's
  `canUpdate`/`canDelete` hints (one BatchCheck per page).
- The web consumes the capability snapshot from `GET /me/permissions`
  (`apps/web/src/lib/permissions.tsx`, `useCan()` / `<Can>`). UI gating is
  cosmetic; the api is the authority.
- **OpenFGA is a hard runtime dependency**: checks are network calls; the
  guard fails closed with a 5xx when the engine is unreachable.

## Management endpoints

- `GET /projects/:id/members` — list relations (any project reader).
- `PUT /projects/:id/members/:userId` — grant/change a relation
  (`can_manage_members`: owner or admin). A project always keeps ≥1 owner.
- `DELETE /projects/:id/members/:userId` — remove a relation.
- `PATCH /users/:id/role` — change a user's global role (admin).
- `GET /me/permissions` — capability snapshot for the signed-in user.

## Add / change permissions

- **New resource type**: `pnpm gen feature` appends a `type` block to
  `packages/fga/model.fga` and registers the resource in
  `packages/contracts/src/permissions.ts`.
- **Model changes**: edit `model.fga`, then `pnpm fga:bootstrap` (models
  are immutable — a new version is written; unpinned clients pick it up
  immediately).
- **Run-book / drift**: same as the base setup — `pnpm compose:dev` →
  `pnpm db:migrate` → `pnpm fga:bootstrap` → `pnpm db:seed` (chains
  `fga:sync`); rerun `pnpm fga:sync` after any lost post-commit tuple
  write.
