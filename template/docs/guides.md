# Guides

Recipes for the changes you'll actually make. Each follows the grain of the
architecture — if a step feels missing, check `docs/architecture.md` first.

## Add a feature (vertical slice)

```sh
pnpm gen feature        # prompts: singular name, plural
```

Generated and auto-registered: contract file + router/index/subjects entries,
drizzle table + schema index entry, api module/controller/service +
`it.todo` integration specs, a web list page. Then:

1. `pnpm db:generate && pnpm db:migrate` — create/apply the migration.
2. Grant permissions: extend `defaultRolePermissions` in
   `packages/contracts/src/permissions.ts`, then `pnpm db:seed` (resets the
   role baseline; per-user overrides are untouched).
3. Add `messages/*.json` keys and a nav item in
   `apps/web/src/components/app-shell.tsx`.
4. Turn the generated `it.todo`s into real tests and make them pass.

## Add an endpoint to an existing feature

1. **Contract** — add the procedure in `packages/contracts/src/<feature>.ts`
   (route needs an explicit `method` + `path`; input/output are zod).
2. **Api** — new controller method with `@Implement(contract.x.y)` +
   `@RequireAbility(...)`, delegate to the service. Type service params with
   the schema **output** types.
3. **Web** — it's already on the typed client:
   `useQuery(orpc.x.y.queryOptions({ input }))` or `client.x.y(input)`.

`pnpm check-types` at the root confirms the whole chain agrees.

## Add / change permissions

- **New subject**: add it to `subjects` in
  `packages/contracts/src/permissions.ts` (the feature generator does this).
- **Role baseline**: edit `defaultRolePermissions`, re-run `pnpm db:seed`.
  Runtime edits go straight into the `role_permission` table — remember
  `AbilityFactory.invalidateRole()` or the 5-minute cache delay applies.
- **Per-user override**: `PUT /users/:id/permission-overrides` with rules
  like `{ action: "delete", subject: "File" }` (grant) or
  `{ ..., inverted: true }` (deny — beats any allow).
- Owner-scoped rules use conditions: `{ ownerId: "${userId}" }`.

## Add an error code

1. Add the code + params schema to `errorCatalog`
   (`packages/contracts/src/errors.ts`).
2. Map it to an HTTP status in `CODE_TO_HTTP`
   (`apps/api/src/common/app-error.ts`).
3. Add `errors.<CODE>` translations to `apps/web/messages/en.json` and
   `fr.json` (params are ICU placeholders).
4. Throw it: `throw appError("YOUR_CODE", { ...typedParams })`.

## Add a locale

1. Add it to `SUPPORTED_LOCALES` in `apps/web/src/i18n/config.ts`.
2. Create `apps/web/messages/<locale>.json` (copy `en.json`).
3. Label it under `shell.locales` in every message file.

## Add an environment variable

1. Declare it in the consuming app's schema —
   `apps/api/src/config/env.ts` or `apps/web/src/env.ts`
   (client-visible vars must be `NEXT_PUBLIC_*`).
2. Add it to `.env.example` (grouped, commented) — the scaffolder and CI
   materialize `.env` from it.
3. If it affects build output, list it in `turbo.json` `tasks.build.env`
   (wildcards like `S3_*` work).
4. Wire it in `docker-compose.yml` (`environment:` overrides for in-network
   hostnames) if containers need a different value than the host does.

## Add shadcn/ui components

```sh
cd apps/web && pnpm dlx shadcn@latest add <component>
```

`components.json` is preconfigured (new-york, zinc, CSS variables).
Generated files land in `src/components/ui/` — they're owned source; biome
ignores that directory.

## Add an email

1. Template in `packages/emails/src/templates/` (use `layout.tsx`).
2. Extend the union/renderer in `packages/emails/src/index.ts`.
3. Enqueue via `MailService` (or add a dedicated queue job for non-auth
   mail). Preview with `pnpm --filter @repo/emails preview`.

## Use the cache

```ts
constructor(private readonly cache: CacheService) {}
this.cache.getOrSet(`thing:${id}`, 300, () => this.load(id));
await this.cache.del(`thing:${id}`);   // on writes
```

Prefix keys per domain (`perm:`, `projects:` are taken); pick TTLs you can
defend; invalidate in the same service that writes.

## Regenerate the Better-Auth schema

After enabling a Better-Auth plugin: `pnpm auth:schema` writes a fresh
drizzle schema to `packages/db/src/schema/auth.generated.ts` — diff it
against `auth.ts`, merge, then `pnpm db:generate`.

## Conventions

- **Branches** (git-flow-next): `main` = production, `develop` = integration,
  `feature/*` → develop, `release/*` and `hotfix/*` → main + develop.
- **Commits**: Conventional Commits, guided by `pnpm commit`; commitlint
  enforces on `commit-msg`.
- **Hooks** (lefthook): biome on staged files (pre-commit), commitlint
  (commit-msg), typecheck (pre-push).
- **Lint rules** are ultracite defaults; deviations are scoped `overrides`
  in `biome.jsonc`, each with a comment saying why. Add new exceptions the
  same way — never inline-disable without a reason.
