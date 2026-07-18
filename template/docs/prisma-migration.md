# Migrating from Drizzle to Prisma

This app uses **Drizzle ORM** (`@repo/db`) with Postgres row-level security.
If your team standardises on **Prisma**, this guide walks the swap end to
end. It is a real migration checklist grounded in the files that ship here,
not a drop-in flag — read [why](#why-this-ships-as-a-guide) below before you
start.

## Why this ships as a guide

The ORM is not a scaffold-time option (`--orm`). The policy
(`docs/maintaining-the-template.md` §"Keeping the template current") is:
**prefer a documented migration guide; add an overlay only when the choice is
structural AND fits the CI-matrix budget.** ORM choice fails on both counts.
Unlike ui/authz/locale, the ORM is not isolated behind one package: `@repo/db`
is imported by `@repo/auth` (adapter + session hook + seeds), `@repo/fga` (the
reconcile job), every api feature service, and the integration suite. A
`--orm=prisma` variant would overlay all of them AND multiply with the six
existing axes — a cost the repo refuses. Migrating your own app once is cheap;
maintaining the cross-product forever is not.

## What touches the ORM

Read these before editing — they are the real surface:

- `packages/db/src/schema/*.ts` — Drizzle tables + `pgPolicy` RLS + `pgRole`.
- `packages/db/src/client.ts` — `createDb` (pg `Pool` + drizzle) and
  `withTenant` (the RLS `set_config` transaction wrapper).
- `packages/db/src/migrate.ts`, `drizzle.config.ts`, `drizzle/*.sql`.
- `packages/db/src/seed.ts` (no-op baseline) and `packages/auth/src/seed-dev.ts`.
- `packages/auth/src/auth.ts` — `drizzleAdapter` + the session `databaseHooks`.
- `packages/fga/src/sync.ts` — reads every table to rebuild FGA tuples.
- `apps/api/src/db/db.module.ts` — `DbService` (runtime + auth pools, `tenant()`).
- `apps/api/test/api.int.test.ts` — Testcontainers, runs the drizzle migrator.

## 1. Schema translation

Point Prisma at the **existing** database and map every model to the current
table/column names so no data moves. Drizzle uses `casing: "snake_case"`
(`client.ts`), so table names are already snake_case (`audit_log`,
`file_object`) while columns are camelCase in TS but snake_case in Postgres —
mirror both with `@@map` / `@map`.

| Drizzle (`pg-core`) | Prisma (`schema.prisma`) |
|---|---|
| `pgTable("audit_log", …)` | `model AuditLog { … @@map("audit_log") }` |
| `text()` camelCase field | `String @map("owner_id")` |
| `varchar({ length: 120 })` | `String @db.VarChar(120)` |
| `bigint({ mode: "number" })` | `BigInt` (or `Int` if you widen) `@db.BigInt` |
| `jsonb().$type<…>()` | `Json? @db.JsonB` |
| `timestamp({ withTimezone: true })` | `DateTime @db.Timestamptz` |
| `uuid().primaryKey().defaultRandom()` | `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` |
| `.defaultNow()` | `@default(now())` |
| `.$onUpdate(() => new Date())` | `@updatedAt` |
| `.default("draft")` | `@default(DRAFT)` (enum) / `@default("member")` |
| `pgEnum("project_status", projectStatuses)` | `enum ProjectStatus { … } @@map` |
| `.references(() => …, { onDelete: "cascade" })` | relation `onDelete: Cascade` |
| `audit_log` FKs `onDelete: "set null"` | `onDelete: SetNull` (keep the trail) |
| `index().on(table.x)` | `@@index([x])` |

The auth tables (`user`, `session`, `account`, `two_factor`, `verification`)
and the organization plugin tables (`organization`, `member`, `invitation`)
are owned by Better-Auth — do not hand-model them; generate them (§5).

Keep `@repo/db` compiling to **CJS** (`docs/maintaining-the-template.md`
constraints table). Prisma Client is CJS-compatible; generate it into the
package and re-export the client + a `tenant` helper from
`packages/db/src/index.ts` so importers keep a single dependency surface.

## 2. Roles, RLS policies, and migrations

Prisma models **do not express roles, `ENABLE ROW LEVEL SECURITY`, or
`CREATE POLICY`** — there is no `pgPolicy`/`pgRole` equivalent in
`schema.prisma`. These live in raw SQL migrations, exactly as
`drizzle/0000_roles.sql` and the `pgPolicy(...)` blocks do today.

Workflow for every policy/role change:

```sh
# Scaffold an empty migration, then hand-write the SQL Prisma won't infer.
npx prisma migrate dev --create-only --name rls_policies
#   → edit prisma/migrations/<ts>_rls_policies/migration.sql
npx prisma migrate dev
```

- **Roles migration** — port `drizzle/0000_roles.sql` verbatim as your first
  hand-written migration (create `app_user` / `app_auth BYPASSRLS` if absent,
  `GRANT USAGE`, `ALTER DEFAULT PRIVILEGES … TO app_user, app_auth`). The
  compose init script `packages/db/sql/init-roles.sh` (LOGIN + passwords) is
  ORM-agnostic — keep it unchanged.
- **Per-table policies** — translate each `pgPolicy(...)` to SQL. They are
  already raw SQL inside `sql\`…\``, so this is copy-paste, e.g. the project
  policy becomes:

  ```sql
  ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY project_tenant_isolation ON "project" FOR ALL TO app_user
    USING (organization_id = current_setting('app.current_org_id', true)
        OR owner_id = current_setting('app.current_user_id', true))
    WITH CHECK (organization_id = current_setting('app.current_org_id', true));
  ```

  Do the same for `member`, `invitation`, `audit_log`, `file_object`
  (`audit_log`'s `WITH CHECK` allows `organization_id IS NULL` for system
  events — keep it). Note: **no `FORCE ROW LEVEL SECURITY`** — the owner and
  `app_auth` must keep bypassing (migrations, seeds, Better-Auth).
- Prisma migrate needs a **shadow database**; the migration role must have
  `CREATEDB` or you must set `shadowDatabaseUrl`. This runs as the owner
  (§4), which already has the privilege.

`packages/db/src/migrate.ts` (the programmatic drizzle migrator used by the
compose `migrate` service) is replaced by `prisma migrate deploy`. Keep it as
a thin script if you still want one compiled entrypoint; it must read
`DATABASE_URL_MIGRATIONS` (§4), same as today.

## 3. The tenant wrapper (RLS context)

The heart of the isolation model is `withTenant` in `client.ts`: it opens a
transaction and pins `app.current_org_id` / `app.current_user_id` /
`app.is_admin` with `set_config(..., true)` (`true` = `SET LOCAL`, so the
settings die with the transaction and never leak onto a pooled connection).
`DbService.tenant()` (`db.module.ts`) feeds it the request's session.

Prisma's equivalent is an **interactive transaction** that sets the config on
its pinned connection before running your work. Keep the identical signature
so `DbService.tenant()` barely changes:

```ts
// packages/db/src/client.ts (Prisma)
export function tenant<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // set_config takes bind parameters, so this stays parameterised
    // (no $executeRawUnsafe). '' for a null org → matches nothing.
    await tx.$executeRaw`select
      set_config('app.current_org_id', ${ctx.organizationId ?? ""}, true),
      set_config('app.current_user_id', ${ctx.userId ?? ""}, true),
      set_config('app.is_admin', ${ctx.isAdmin ? "true" : "false"}, true)`;
    return fn(tx);
  });
}
```

A `$extends` query extension (`query.$allOperations`) that wraps each call in
its own transaction is the documented alternative, but it pins context **per
operation** — a request doing several reads/writes would no longer share one
RLS-scoped transaction. Prefer the explicit `tenant(fn)` wrapper; it maps 1:1
onto how services call `dbService.tenant(async (db) => …)` today. Services
keep their explicit `organizationId` filters — RLS is the net, not the
primary filter.

## 4. Three roles, three connection URLs

The three principals do not change; only how you feed them to the client
does. `schema.prisma`'s `datasource` reads one `env("…")`, so **override the
URL per client** rather than declaring three datasources.

| Env var | Role | Used by |
|---|---|---|
| `DATABASE_URL` | `app_user` (RLS) | runtime `PrismaClient` — the `db` in `DbService` |
| `DATABASE_URL_AUTH` | `app_auth` (BYPASSRLS) | the Better-Auth adapter client only |
| `DATABASE_URL_MIGRATIONS` | owner (bypasses RLS) | `prisma migrate`, seeds, `fga:sync` |

```ts
// runtime (RLS)          → new PrismaClient({ datasourceUrl: env.DATABASE_URL })
// auth (BYPASSRLS)       → new PrismaClient({ datasourceUrl: env.DATABASE_URL_AUTH })
// migrate/seed/sync      → new PrismaClient({ datasourceUrl: env.DATABASE_URL_MIGRATIONS })
```

Point `schema.prisma`'s datasource at `DATABASE_URL_MIGRATIONS` (or pass
`--url`) so `prisma migrate` runs as the owner and can `ALTER`/`CREATE
POLICY`. `DbService` still constructs two clients (runtime + auth) and closes
them on shutdown — replace `pool.end()` with `prisma.$disconnect()` and drop
the `ping()` `pool.query("SELECT 1")` in favour of `$queryRaw\`SELECT 1\``.
Keep the env schema in `apps/api/src/config/env.ts` unchanged (strict, no
defaults): all three URLs stay required.

## 5. Better-Auth: `drizzleAdapter` → `prismaAdapter`

In `packages/auth/src/auth.ts`, swap the adapter and its imports:

```ts
import { prismaAdapter } from "better-auth/adapters/prisma";
// …
database: prismaAdapter(options.db, { provider: "postgresql" }),
```

`options.db` becomes the **auth `PrismaClient`** (`DATABASE_URL_AUTH`,
BYPASSRLS) — Better-Auth reads `member` before a tenant context exists, so it
must bypass RLS, exactly as the drizzle `authDb` does now. The session
`databaseHooks.session.create.before` hook currently runs a drizzle
`select(...).from(schema.member)`; rewrite it as
`options.db.member.findFirst({ where: { userId }, select: { organizationId: true } })`.

Generate the auth schema with the Better-Auth CLI instead of `pnpm
auth:schema` (which emits drizzle):

```sh
npx @better-auth/cli generate      # writes Prisma models for the enabled plugins
npx prisma migrate dev             # Better-Auth does NOT migrate Prisma — you do
```

The CLI supports Prisma **schema generation** but not migration; apply it
with `prisma migrate`. Re-run after enabling any plugin (`admin`,
`organization`, `twoFactor` are on today) and diff, same discipline as the
comment on `schema/auth.ts`.

## 6. FGA sync and seeds

`packages/fga/src/sync.ts` reads the whole database (owner connection) to
rebuild structural tuples. Replace the drizzle selects with Prisma
`findMany`s — the shape is identical:

```ts
const [users, orgs, members, projects, files] = await Promise.all([
  prisma.user.findMany({ select: { id: true, role: true } }),
  prisma.organization.findMany({ select: { id: true } }),
  prisma.member.findMany({ select: { organizationId: true, userId: true } }),
  prisma.project.findMany({ select: { id: true, organizationId: true, ownerId: true } }),
  prisma.fileObject.findMany({ select: { id: true, organizationId: true, ownerId: true } }),
]);
```

Construct the client from `DATABASE_URL_MIGRATIONS ?? DATABASE_URL` (the sync
legitimately reads every tenant — keep that comment) and call
`prisma.$disconnect()` in the `finally` instead of `pool.end()`. The tuple
logic (`DERIVED_RELATIONS`, chunked writes, deny-wins grant preservation) is
ORM-agnostic — leave it untouched.

`packages/auth/src/seed-dev.ts` uses drizzle for existence checks and demo
`project`/`member` inserts around `auth.api.signUpEmail`; rewrite those
queries to Prisma (owner client) and keep the idempotent/`NODE_ENV !==
production` guards. `packages/db/src/seed.ts` stays a no-op (role baselines
live in `packages/fga/model.fga`, not the DB). The root `pnpm db:seed` chain
(`db:migrate` → `seed:dev` → `fga:sync`) is unchanged.

## 7. Tooling and scripts

Update `packages/db/package.json` scripts and deps:

- Remove `drizzle-orm`, `drizzle-kit`; add `@prisma/client`, `prisma`.
- `generate` → `prisma generate`; `migrate` → `prisma migrate deploy`;
  `studio` → `prisma studio`. Add a `db:generate`-style step that runs
  `prisma migrate dev` in development.
- Add `prisma generate` to the build (`postinstall` or the turbo `build`
  input) so the client exists before `tsc`. Ensure the generated client is a
  build **output**, not committed, and that CI regenerates it.
- Drop `drizzle.config.ts` and `drizzle/`; add `prisma/schema.prisma` and
  `prisma/migrations/`.

Update `docs/stack.md` (the Drizzle row), `docs/architecture.md`, and any
`.claude/rules` mentioning drizzle so the AI config stays accurate.

## 8. Testcontainers / integration suite

`apps/api/test/api.int.test.ts` boots real Postgres/Redis/OpenFGA, derives
the three role URLs from the container (`app_user` / `app_auth` with
password = role name), and runs the **drizzle** migrator against the owner
URL before any restricted-role connection. For Prisma:

- Apply migrations against the container as the **owner** before the app
  connects — e.g. `execSync("npx prisma migrate deploy", { env: { …,
  DATABASE_URL: ownerUrl } })`, replacing the `migrate(db, {
  migrationsFolder })` call. This must run the **roles + RLS** migration
  (§2) first, so `app_user`/`app_auth` exist and policies are live before the
  suite connects as those principals.
- Keep the three `process.env.DATABASE_URL*` assignments exactly as they are
  — the suite already models the production three-role split, which is the
  whole point of the RLS tests.

## Migration checklist

1. Introspect + hand-map `schema.prisma` (`@@map`/`@map`, §1); `prisma generate`.
2. Roles + RLS as raw SQL migrations via `--create-only` (§2).
3. `tenant()` transaction wrapper with `set_config` (§3); rewire `DbService`.
4. Per-client `datasourceUrl` for the three roles (§4).
5. `prismaAdapter` + `@better-auth/cli generate` + session hook (§5).
6. Prisma `findMany` in `sync.ts` and `seed-dev.ts` (§6).
7. Scripts/deps, remove drizzle, update docs (§7).
8. Testcontainers → `prisma migrate deploy`; run
   `pnpm --filter @repo/api test:integration` — it is the real proof the RLS
   swap held.
