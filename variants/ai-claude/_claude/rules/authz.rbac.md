---
paths:
  - "packages/contracts/src/permissions.ts"
  - "packages/fga/**"
  - "apps/api/src/auth/**"
  - "apps/api/src/fga/**"
---

# Authorization — RBAC on OpenFGA (this scaffold's model)

- The model is `packages/fga/model.fga` (OpenFGA DSL). Global roles
  (`admin`, `manager`, `member`) hang off `system:global`; tenants are
  `org:<id>`; resources carry `org` + `owner` relations. Only `can_*`
  capability relations are ever checked — never structural relations.
- **Postgres is the source of truth, FGA a derived index**: write the DB
  row first, the tuple after commit (FgaService writes are idempotent).
  `pnpm fga:sync` rebuilds derived tuples; per-user grants
  (`granted_*`/`denied_*`) live ONLY in FGA and are preserved by sync.
  Deny grants beat every allow (`but not` in the model).
- Model changes require `pnpm fga:bootstrap` (models are immutable — a new
  version is written). Role baselines are model edits, not DB rows.
- Guard routes with `@RequirePermission({relation, scope})` — `scope:
  "org"` checks `org:<activeOrganizationId>` (skipped when no active org:
  services must answer with empty lists, never 403), `scope: "system"`
  checks the cross-tenant admin surface. Row-level checks in services:
  `await fga.check(fga.me(), "can_update", fga.ref.project(id))`.
- The web consumes the capability snapshot (`GET /me/permissions`,
  `useCan()` in `apps/web/src/lib/permissions.tsx`); row-level buttons use
  DTO flags (`canUpdate`/`canDelete`, one BatchCheck per page). Never
  implement a permission that exists on only one side.
- New entity (via `pnpm gen feature`): the generator appends a `type` block
  to `model.fga` and registers the resource in contracts — review the
  generated capabilities, then `pnpm fga:bootstrap`.
