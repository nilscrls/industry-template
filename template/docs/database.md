# Database — TypeORM

`@repo/db` owns the schema: entities, migrations, a `DataSource` factory and
the transaction/tenant-context helper. Nothing else touches Postgres
directly (Better-Auth gets its own `pg.Pool` — see below).

## Naming and quoting

TypeORM's default naming strategy is used everywhere (property name ==
column name), so **every column is camelCase** — `organizationId`, not
`organization_id`. App tables get an explicit name in `@Entity({ name })`
(`project`, `fileObject`, `auditLog`, `wallet`, `walletEntry`); Better-Auth's
own tables (`user`, `session`, `account`, `verification`, `organization`,
`member`, `invitation`, `twoFactor`) are camelCase by Better-Auth's own
convention, and read-only entity mirrors exist for them (see below).

**The rule**: in raw SQL — migrations, `manager.query(...)`, the `pg.Pool`
handed to Better-Auth — always double-quote camelCase identifiers:
`"organizationId"`. Inside a TypeORM `QueryBuilder` string, use
`alias.property` **unquoted** (`w.organizationId = :org`, `p.createdAt`) and
let TypeORM quote it — a quoted name inside a QueryBuilder string is left
verbatim and breaks on a camelCase alias.

## Entities and migrations

- One file per entity in `packages/db/src/entities/`, explicit column types
  (`@Column({ type: "text" })`, `@PrimaryGeneratedColumn("uuid")`, etc. —
  never rely on TypeORM's type inference). `packages/db/src/entities/index.ts`
  exports every class and the `ENTITIES` array consumed by the
  `DataSource`; it carries two generator markers (`pnpm gen feature` inserts
  new entities there).
- Migrations are **hand-written** TypeORM `MigrationInterface` classes in
  `packages/db/src/migrations/`, registered by an explicit list in
  `packages/db/src/migrations/index.ts` (no glob — a missing import is a
  compile error, not a silently-skipped migration). TypeORM orders
  migrations by the **13 trailing digits of the class name**, not the
  filename or file mtime — `Init1700000000001`, not the file's timestamp
  prefix alone. Keep the filename's digits in sync with the class name for
  humans reading the directory listing, but the class name is what actually
  governs ordering.
- Auth entities (`User`, `Session`, `Account`, `Verification`,
  `Organization`, `Member`, `Invitation`, `TwoFactor`) are **read models**:
  Better-Auth owns every write to those tables through its own `pg.Pool`.
  `Session` and `Verification` in particular are typically **empty at
  runtime** once Redis secondary storage is configured (the api always
  configures it) — Better-Auth reads/writes sessions and verification
  tokens through Redis, not Postgres, in that mode. Do not query them from
  feature code; if you need session data, read it from the request context
  the auth middleware already populated.
- No relation decorators (`@ManyToOne` etc.) are required or used — plain FK
  columns, same as before. If you do add one, target an arrow-function
  class reference to dodge import-order issues.

### `pnpm db:generate` writes a draft migration — never apply it unreviewed

`pnpm db:generate -- src/migrations/AddThing` runs
`typeorm migration:generate`, which **connects to a live, already-migrated
database** (`DATABASE_URL_MIGRATIONS`, falling back to `DATABASE_URL` — so
start compose and run `pnpm db:migrate` first) and diffs it against the
entity metadata. It does not run anything against that database, but it does
**write the migration file** at the path you pass. Read it as a diff, then
hand-edit or delete it. It is genuinely useful for catching a column you
forgot to update in an entity after editing a migration by hand, but it is
blind to two things:

1. **Row-level security.** Policies, `ENABLE ROW LEVEL SECURITY`, and the
   `app_user`/`app_auth` grants are pure SQL with no entity-level
   counterpart — the differ has no idea they exist and will happily leave
   them out of a "helpful" migration that DROPs and recreates a table.
2. **Foreign keys.** This template intentionally uses plain FK *columns*
   with no `@ManyToOne` relation decorators (see above), so TypeORM's
   entity metadata carries **no FK information at all**. Every
   `db:generate` run will propose DROPping every foreign-key constraint in
   the database — this is expected, not a sign anything is wrong, and is
   not something to "fix" by adding relation decorators everywhere.

Treat the generated file as a starting point to hand-edit (or throw away),
never as something to apply as-is. `pnpm db:migrate` is the only command that
actually changes a database.

## The three database principals

Every connection in this stack is one of:

- **owner** (`DATABASE_URL_MIGRATIONS`, falls back to `DATABASE_URL`) — runs
  migrations and seeds. Not subject to RLS (`FORCE ROW LEVEL SECURITY` is
  deliberately never used, so the table owner always bypasses policies);
  legitimately crosses tenants.
- **`app_user`** (`DATABASE_URL`) — the api's runtime connection for
  feature services. Subject to RLS: every org-scoped table's policy is
  enforced on every query this role issues, so a forgotten `WHERE` clause
  returns zero foreign rows instead of leaking them, rather than a 500.
- **`app_auth`** (`DATABASE_URL_AUTH`) — `BYPASSRLS`, handed only to
  Better-Auth's `pg.Pool` and the user-deletion lifecycle hooks (it needs
  to read `member` before a tenant context exists, at session-creation
  time). Never used by feature services.

Connection budget: each api instance opens up to **20** connections on
`app_user` (the runtime DataSource — sized above the concurrent-spend path
below), **5** on the `app_auth` DataSource (lifecycle hooks only) and **10**
on Better-Auth's own `app_auth` pool: 35 per instance. Postgres' default
`max_connections` is 100 — size it (or a pooler) for the replica count you
deploy.

Both `app_user` and `app_auth` are created `NOLOGIN` by the `Roles`
migration (idempotent: `duplicate_object` is swallowed) — the operator
enables them with a real password via `ALTER ROLE ... LOGIN PASSWORD '...'`
(done automatically in dev by `packages/db/sql/init-roles.sh` on first
postgres boot).

## Row-level security + `tenant()`

Org-scoped tables (`project`, `fileObject`, `auditLog`, `wallet`,
`walletEntry`, `member`, `invitation`) carry a policy shaped like:

```sql
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_tenant_isolation" ON "project" AS PERMISSIVE FOR ALL
  TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true) OR "ownerId" = current_setting('app.current_user_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
```

`withTenant(dataSource, ctx, fn, opts?)` (re-exported as `DbService.tenant()`
in the api) is the only way that GUC context gets set:

```ts
return opts.isolation
  ? dataSource.transaction(opts.isolation, run)
  : dataSource.transaction(run);
// where run does:
//   select set_config('app.current_org_id', $1, true),
//          set_config('app.current_user_id', $2, true),
//          set_config('app.is_admin', $3, true)
// then calls fn(manager)
```

`set_config(..., true)` is `SET LOCAL`: it dies with the transaction and
never leaks onto another connection pulled from the pool later. `tenant()`
**is** one transaction — every query inside its callback runs on the same
connection with the same pinned context.

Two rules that matter more than they look:

- **Never call `withTenant`/`tenant()` again inside a `tenant()` callback.**
  A nested call opens a *second* connection and a *second* transaction,
  which self-deadlocks the instant either transaction holds a row lock the
  other one needs. Pass the `EntityManager` down to helpers instead of
  reaching for `dbService.tenant()` a second time.
- RLS is the **net**, not the primary filter — keep explicit
  `organizationId` filters in services. The one deliberate exception is the
  admin organization listing, which relies on the `app.is_admin` GUC
  instead of an org predicate.

## Transactions: the points wallet

`apps/api/src/wallet/` is the template's reference implementation for
"a user cannot double-spend under concurrent requests." It demonstrates the
full idiom in one place:

- `tenant()` gives you one transaction per request.
- `spend` takes a **pessimistic row lock** on the wallet row
  (`.setLock("pessimistic_write")` in the `SELECT`), so a second concurrent
  `spend` blocks until the first one commits or rolls back.
- The actual debit is an **atomic conditional `UPDATE`** —
  `WHERE id = :id AND balance >= :amount` — checked via
  `UpdateResult.affected === 1`, not by trusting an earlier `SELECT`'s
  balance. Between the lock-holding `SELECT` and the `UPDATE` nothing else
  can change the row (same transaction, same lock), but the `WHERE` clause
  is what actually enforces the invariant — never trust a `save()` or a
  bare `UPDATE` to have hit the row you expect without checking `affected`
  (or using `.returning('*')` and checking the result set is non-empty).
- A Postgres `CHECK` constraint (`wallet_balance_nonnegative`,
  `"balance" >= 0`) is the **backstop**, not the primary defense: if the
  application logic above is ever wrong, the database refuses the write
  outright (`SQLSTATE 23514`). This is an integrity violation — a bug
  signal — so it surfaces to the caller as a plain `500 INTERNAL`, not a
  user-facing `409`; a real insufficient-balance case never reaches the
  database, it's rejected by the conditional `UPDATE` returning
  `affected: 0` first.
- `credit` upserts with `INSERT ... ON CONFLICT ("organizationId",
  "userId") DO UPDATE SET "updatedAt" = now()` — deliberately `DO UPDATE`,
  not `DO NOTHING`: `DO NOTHING` returns no row and takes no lock when the
  row already exists, which would let a concurrent `credit` and `spend`
  race past each other.
- Choosing `pessimistic_write` (lock and wait) instead of `SERIALIZABLE` +
  retry is a deliberate simplicity trade-off for a single hot row; a
  workload with many rows contending in unpredictable orders is a better
  fit for `SERIALIZABLE` isolation with an application-level retry loop
  (`opts.isolation` on `tenant()` supports this today).
- Never nest `tenant()` calls here either — `spend`/`credit`/`me` are each
  exactly one `tenant()` call.

## Better-Auth's tables

Better-Auth gets a raw `pg.Pool` (`database: pool`), not a TypeORM
`DataSource` — it uses its own built-in Kysely-based adapter, which also
double-quotes identifiers, so the table/column shapes line up with the
naming rule above. The entities in `packages/db/src/entities/` for those
tables exist so the rest of the app can *read* them through TypeORM (joins,
reports); Better-Auth's own pool is still the only writer.

**Drift check**: Better-Auth is pinned to an **exact** version (not a caret
range) specifically because its hand-written mirror tables in `@repo/db`
must not silently drift on a Renovate minor bump. After enabling a new
plugin, or before accepting a Better-Auth version bump:

1. `pnpm compose:dev` then `pnpm db:migrate` — `pnpm auth:schema` needs a
   **live, migrated** database; it introspects it, it does not read the
   entity files.
2. `pnpm auth:schema` (`packages/auth`'s `generate-schema` script runs the
   `@better-auth/cli` `generate` command against `src/auth-cli.ts` — a
   config file that is never imported at runtime, only used by the CLI —
   and writes `packages/db/better-auth-diff.sql`).
3. An **empty** diff means no drift. A non-empty diff is the missing DDL:
   paste it into a new hand-written migration and mirror the same columns
   onto the matching entity file.

The same live-database requirement is why this check is a manual/CI step,
not a build-time assertion — there is a dedicated integration test that
runs `better-auth/db/migration`'s `getMigrations()` against the current
entities and expects both `toBeCreated` and `toBeAdded` to be empty.
