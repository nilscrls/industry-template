---
paths:
  - "packages/db/**"
  - "packages/contracts/**"
---

# @repo/db + @repo/contracts — data layer conventions

- Entities live in `packages/db/src/entities/` (one class per file,
  explicit column types — never rely on inference). Migrations are
  **hand-written** TypeORM `MigrationInterface` classes in
  `packages/db/src/migrations/`, registered by an explicit list, never a
  glob. TypeORM orders migrations by the **13 trailing digits of the class
  name** (not the filename) — a class without them throws. `pnpm gen
  feature` registers new entities/migrations in the two index files via
  their gen-markers.
- TypeORM's default naming strategy means every column is **camelCase**
  (property name == column name). In raw SQL (migrations,
  `manager.query`, the `pg.Pool` handed to Better-Auth) always double-quote
  camelCase identifiers (`"organizationId"`); inside a QueryBuilder string
  use `alias.property` **unquoted** and let TypeORM quote it. See
  `docs/database.md`.
- `pnpm db:generate` reads a **live, already-migrated** database
  (`DATABASE_URL_MIGRATIONS`) and **writes** a draft migration file at the
  path you pass; it never applies anything. The draft is blind to RLS
  policies/grants and (in this template) foreign keys, since entities use
  plain FK columns with no relation decorators. Hand-edit it into a real
  migration (or delete it); never commit its output unreviewed.
- Apply with `pnpm db:migrate`; keep `pnpm db:seed` working after every
  entity/migration change (seeds are part of the scaffold's first-run
  experience).
- Better-Auth owns its own tables via a raw `pg.Pool`, not TypeORM — after
  enabling a plugin, drift-check with `pnpm auth:schema` against a live,
  migrated database (see `docs/database.md`); never hand-edit the auth
  entity files to guess at a schema.
- **Row-level security**: every org-scoped table gets an explicit
  `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` in its migration (see
  `migrations/1700000000001-Init.ts`). New org-scoped tables MUST do the
  same, and their api services MUST run queries through
  `dbService.tenant(...)` — outside it the runtime role sees zero rows.
  Keep the explicit `organizationId` filters; RLS is the net, not the
  filter. Three DB principals: owner (migrations/seeds), `app_user`
  (runtime, RLS), `app_auth` (Better-Auth only, BYPASSRLS).
- **Transactions**: `tenant()` is one transaction — never call
  `tenant()`/`withTenant` again inside a `tenant()` callback (a nested call
  opens a second connection/transaction and self-deadlocks on a row lock).
  Run multiple queries inside one `tenant()` callback **sequentially**, not
  via `Promise.all` — see the points wallet
  (`apps/api/src/wallet/wallet.service.ts`) for the pessimistic-lock +
  atomic-conditional-update + CHECK-constraint-backstop pattern.
- Contracts (`packages/contracts`) are the single source of truth for API
  shapes: oRPC contract + Zod schemas + the authorization vocabulary
  (capabilities/resources; the rules themselves live in
  `packages/fga/model.fga`). Change the contract first; the api implements
  it, the web consumes it.
- Zod schemas that parse query params use `z.coerce` — that is why server
  handlers must type inputs from schema **outputs** (see the api rules).
- These packages compile to CommonJS (no `"type": "module"`); scripts use
  `main().catch(...)`, never top-level await.
