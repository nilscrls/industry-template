---
paths:
  - "packages/contracts/src/permissions.ts"
  - "packages/fga/**"
  - "apps/api/src/auth/**"
  - "apps/api/src/fga/**"
  - "packages/db/src/entities/project-member.ts"
---

# Authorization — ReBAC on OpenFGA (this scaffold's model)

- The model is `packages/fga/model.fga` (OpenFGA DSL). Global roles are
  only `admin` (bypasses relations) and `user`. Real access is the
  per-project relation ladder `owner ⊃ editor ⊃ viewer`, exposed as
  `can_read`/`can_update`/`can_delete`/`can_manage_members` capabilities
  (`can_manage_wallet` is `admin`-only — see the points wallet in
  `docs/database.md`, "Transactions").
- **`projectMember` rows are the DB source of truth**
  (`packages/db/src/entities/project-member.ts`); every membership write
  mirrors into an FGA tuple in the same request (row first, tuple after
  commit — see `syncMemberTuples`). The creator's `owner` row is inserted
  in the same transaction as project creation. `pnpm fga:sync` rebuilds all
  derived tuples.
- Model changes require `pnpm fga:bootstrap` (models are immutable — a new
  version is written).
- Guard routes with `@RequirePermission({relation, scope})`; list/read
  endpoints stay service-scoped (DB join on `projectMember`) — a fresh
  user must get an empty list, not a 403. Row-level checks:
  `await fga.check(fga.me(), "can_update", fga.ref.project(id))`.
- The web consumes the capability snapshot (`GET /me/permissions`,
  `useCan()`); row-level buttons use DTO flags (`canUpdate`/`canDelete`).
- New entity (via `pnpm gen feature`): decide whether it is
  relation-scoped (give it its own relations in the generated `type`
  block) or org-baseline. See `docs/authorization.md`.
