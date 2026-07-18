---
paths:
  - "apps/api/**"
---

# apps/api — NestJS conventions

- The api is **CommonJS**. No top-level await in scripts — use
  `main().catch(...)`. Keep `__dirname` where you find it (with its
  biome-ignore); `import.meta.dirname` breaks CJS.
- **DI tokens live in `*.constants.ts` files, never in the Nest module that
  provides them.** A service importing a token from its own module file is a
  circular import: the token evaluates `undefined` inside `@Inject()` at
  runtime (in both the app and vitest).
- Never convert DI-injected classes to `import type` — it erases the
  constructor metadata Nest resolves dependencies from. This is why
  `style/useImportType` is disabled for this app; leave it disabled.
- Endpoints implement contracts from `@repo/contracts` via `@orpc/nest`
  (`@Implement`). New feature? Run `pnpm gen` at the repo root instead of
  hand-writing the module.
- Authorization is OpenFGA: guard endpoints with
  `@RequirePermission({relation, scope})` and check rows in services via
  `fga.check(...)`; list/read endpoints scope results in the service
  instead of returning 403 (a fresh user must get an empty list, not an
  error). Mirror every relevant DB write with its FGA tuple (row first,
  tuple after commit) — see the authz rule file.
- Better-Auth mounting is deliberate and fragile: `baseURL` carries the full
  public path (a path in `baseURL` *replaces* `basePath`), and the express
  mount registers **before** `app.init()` so Nest's 404 catch-all doesn't
  swallow it. Don't reorder bootstrap.
- That express mount also means the auth endpoints **bypass Nest's global
  `ThrottlerGuard`** — their only rate limiting is Better-Auth's built-in
  `rateLimit` (Redis-backed via secondary storage, gated by
  `AUTH_RATE_LIMIT_ENABLED`). Don't disable it assuming the throttler
  covers `/auth/*`, and keep the tighter sign-in/sign-up/reset rules when
  touching it.
- Caching is scope-first: `cache.forOrg(orgId)` / `cache.forUser(userId)` /
  `cache.global()` (caller-independent values only). Never build raw Redis
  keys from request data — an unscoped key is a cross-tenant IDOR waiting to
  happen. Scope ids come from the session, never from headers.
- HTTP responses default to `Cache-Control: private, no-store` (set in
  `app.setup.ts`). A public caller-independent endpoint may opt in with
  `@Header("Cache-Control", "public, max-age=…")` — then also set `Vary` for
  any request header it varies by.
- BullMQ receives plain connection options parsed from `REDIS_URL` — never
  pass an ioredis instance (nominal type clash with bullmq's bundled
  ioredis).
- `vitest.swc.ts` keeps explicit `legacyDecorator + decoratorMetadata`;
  unplugin-swc does not read tsconfig. Don't remove it.
- Integration tests (`pnpm test:integration`, Testcontainers) set **every**
  server env var explicitly — strict env has no fallbacks. Adding a var
  means updating the integration-test env too.
