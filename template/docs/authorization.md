# Authorization — RBAC (roles + per-user grants) on OpenFGA

This project uses the **RBAC** flavor of the OpenFGA setup (chosen at
scaffold time; the alternative is a relationship-based ReBAC model).

Three global roles (`admin`, `manager`, `user`) defined in the
authorization model, plus per-user allow/deny **grants** on individual
resources. Deny wins.

Underneath the application layer, **Postgres row-level security** enforces
tenant isolation as defense in depth: org-scoped tables (`project`,
`fileObject`, `auditLog`, `wallet`, `walletEntry`, `member`, `invitation`)
carry policies matching `current_setting('app.current_org_id')`, set per
request by `DbService.tenant(...)` (SET LOCAL inside a transaction). The API
connects as the restricted `app_user` role; a query that forgets its WHERE
clause returns zero foreign rows instead of leaking them. Better-Auth uses
the `app_auth` BYPASSRLS role (it reads `member` before a tenant exists);
migrations/seeds run as the owner. See `docs/database.md` and
`packages/db/src/migrations/1700000000000-Roles.ts`.

## How it works

- **The model** lives in `packages/fga/model.fga` (OpenFGA DSL). Global
  roles hang off the singleton `system:global`; each tenant is
  `org:<organizationId>`; resources (`project:<id>`, `file:<id>`) carry an
  `org` link and an `owner`. Capability relations (`can_*`) are what gets
  checked — never raw structural relations.
- **Tuples** mirror the database (Postgres is the source of truth):
  Better-Auth `organizationHooks` write org/member tuples, `setRole`
  rewrites system tuples, services write resource tuples after commit.
  `pnpm fga:sync` rebuilds every derived tuple from the DB (grants are
  preserved — they live only in FGA).
- **Per-user grants** (`granted_read`/`granted_write` allow,
  `denied_read`/`denied_write` deny) are tuples on specific resources;
  `but not denied_*` in the model makes **deny beat every allow**,
  including the owner's.
- Enforcement is two-layered: `@RequirePermission({relation, scope})` for
  coarse route checks (PermissionsGuard; `scope: "org"` checks the active
  organization, `scope: "system"` the cross-tenant admin surface), and
  `fga.check(fga.me(), "can_update", fga.ref.project(id))` in services for
  row-level checks.
- The web consumes the capability snapshot from `GET /me/permissions`
  (`apps/web/src/lib/permissions.tsx`, `useCan()` / `<Can>`); row-level
  buttons ride on DTO flags (`project.canUpdate`). UI gating is cosmetic;
  the api is the authority.
- **OpenFGA is a hard runtime dependency**: every request checks over the
  network; the guard fails closed with a 5xx (never a silent allow) when
  the engine is unreachable. Compose gates api startup on the openfga
  healthcheck.

## Management endpoints

- `PATCH /users/:id/role` — change a user's role (admin).
- `GET|PUT /users/:id/grants` — per-user resource grants/denies (admin).
- `GET /me/permissions` — capability snapshot for the signed-in user.

## Add / change permissions

- **New resource type**: `pnpm gen feature` appends a `type` block to
  `packages/fga/model.fga` and registers the resource in
  `packages/contracts/src/permissions.ts`.
- **Role baselines**: edit the capability definitions in `model.fga`, then
  `pnpm fga:bootstrap` (models are immutable — a new version is written;
  unpinned clients pick it up immediately). Role baselines are **not**
  runtime-editable rows anymore — changing them is a deploy, which also
  makes them reviewable.
- **Operational run-book**: `pnpm compose:dev` → `pnpm db:migrate` →
  `pnpm fga:bootstrap` (copy `FGA_STORE_ID` into `.env` on first run) →
  `pnpm db:seed` (chains `fga:sync`).
- **Drift**: post-commit tuple writes can be lost if FGA is down at that
  exact moment (the request 500s, loudly). `pnpm fga:sync` reconciles the
  store from the database. Upgrade path for high write volumes: move tuple
  writes into a transactional outbox.
