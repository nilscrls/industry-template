# Guides

Recipes for the changes you'll actually make. Each follows the grain of the
architecture — if a step feels missing, check `docs/architecture.md` first.

## Add a feature (vertical slice)

```sh
pnpm gen feature        # prompts: singular name, plural
```

Generated and auto-registered: contract file (list/find/create/update/remove
with search + `sortBy`) + router/index/subjects entries, drizzle table +
schema index entry, api module/controller/service + `it.todo` integration
specs, a URL-state web table page (TanStack Table + nuqs) with its
`search-params.ts` + unit test, i18n keys in `messages/en.json` AND
`fr.json`, and a nav item in `apps/web/src/components/app-shell.tsx`. Then:

1. `pnpm lint:fix` — normalize the generated import order.
2. `pnpm db:generate && pnpm db:migrate` — create/apply the migration.
3. Grant permissions for the new subject — see `docs/authorization.md` for
   this project's model.
4. Review the inserted i18n copy (the French strings are real, the entity
   words are placeholders) and swap the nav icon (the generator reuses the
   projects icon).
5. Turn the generated `it.todo`s into real tests and make them pass.

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

Authorization rules live in `packages/contracts/src/permissions.ts` and are
enforced by the api's `AbilityFactory`. The exact workflow depends on the
model chosen at scaffold time — `docs/authorization.md` documents this
project's setup (rule sources, management endpoints, cache invalidation).

## Add an error code

1. Add the code + params schema to `errorCatalog`
   (`packages/contracts/src/errors.ts`).
2. Map it to an HTTP status in `CODE_TO_HTTP`
   (`apps/api/src/common/app-error.ts`).
3. Add `errors.<CODE>` translations to `packages/i18n/messages/en.json` and
   `fr.json` (params are ICU placeholders).
4. Throw it: `throw appError("YOUR_CODE", { ...typedParams })`.

## Add a locale

1. Add it to `SUPPORTED_LOCALES` in `packages/i18n/src/config.ts`.
2. Create `packages/i18n/messages/<locale>.json` (copy `en.json`).
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

Every cache key carries its authorization scope — the API makes an unscoped
key impossible, which is the classic cache-poisoning / cross-tenant IDOR
vector:

```ts
constructor(private readonly cache: CacheService) {}
// Tenant data → org scope (key becomes org:<orgId>:things)
this.cache.forOrg(orgId).getOrSet("things", 300, () => this.load(orgId));
await this.cache.forOrg(orgId).del("things"); // on writes
// Per-user data → user scope
this.cache.forUser(userId).getOrSet("prefs", 300, () => ...);
// global() is a deliberate escape hatch: ONLY for values identical for
// every caller (role rule sets, feature defaults) — never anything derived
// from a request's session or headers.
```

Rules:

- Scope ids come from the **authenticated session** (`activeOrganizationId()`,
  `currentUser().id`) — never from request headers or query params.
- Prefix keys per domain (`perm:`, `projects:` are taken); pick TTLs you can
  defend; invalidate in the same service that writes.
- HTTP responses are `Cache-Control: private, no-store` by default (set in
  `app.setup.ts`); a public, caller-independent endpoint opts in explicitly
  with `@Header("Cache-Control", "public, max-age=…")` — and must then also
  set `Vary` on any request header it varies by.
- Deployment note: the reverse proxy must forward an accurate `Host` /
  `X-Forwarded-*`; nothing in the app derives cache keys or URLs from
  request headers, keep it that way.

## Regenerate the Better-Auth schema

After enabling a Better-Auth plugin: `pnpm auth:schema` writes a fresh
drizzle schema to `packages/db/src/schema/auth.generated.ts` — diff it
against `auth.ts`, merge, then `pnpm db:generate`.

## Conventions

- **Branches** (git-flow-next): `__PROD_BRANCH__` = production, `develop` = integration,
  `feature/*` → develop, `release/*` and `hotfix/*` → __PROD_BRANCH__ + develop.
  Full model + release walkthrough: `docs/git-flow.md` and `docs/releases.md`.
- **Commits**: Conventional Commits, guided by `pnpm commit`; commitlint
  enforces on `commit-msg`.
- **Hooks** (lefthook): biome on staged files (pre-commit), commitlint
  (commit-msg), typecheck (pre-push).
- **Lint rules** are ultracite defaults; deviations are scoped `overrides`
  in `biome.jsonc`, each with a comment saying why. Add new exceptions the
  same way — never inline-disable without a reason.
