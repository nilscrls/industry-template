# Testing

## The pyramid

| Layer | Runner | Lives in | Talks to | Command |
|---|---|---|---|---|
| Unit | Vitest | `src/**/*.{test,spec}.ts`, colocated | nothing (pure logic) | `pnpm test` |
| Integration | Vitest + Testcontainers | `apps/api/test/*.int.test.ts` | real Postgres + Redis + the full Nest middleware stack over HTTP | `pnpm test:integration` (needs Docker) |
| E2E | Playwright | `apps/web/e2e/` | the running app (chromium + Pixel 7 viewport) | `pnpm test:e2e` |

Contract invariants (every route has a method/path, error payloads validate)
are unit tests inside `packages/contracts` — they run in the plain `test`
task.

## TDD loop

1. `pnpm gen feature` gives you `it.todo` integration specs.
2. Turn one into a real test using the pattern in
   `apps/api/test/api.int.test.ts` — boot once via `createApp()` (the exact
   production stack), drive with `supertest.agent` (keeps cookies), sign up
   users through the real `/auth` endpoints.
3. Watch it fail: `pnpm --filter @repo/api exec vitest --config vitest.integration.config.ts`.
4. Implement until green; extract pure logic and unit-test it where it sits.

Fast inner loop: unit tests in watch mode (`pnpm --filter <pkg> exec vitest`)
while the integration suite stays the outer check.

## What the integration suite guarantees

`api.int.test.ts` is not a smoke test — it pins the load-bearing behavior:

- readiness reflects real db/redis connectivity;
- unauthenticated requests serialize `AUTH_UNAUTHORIZED` with a `traceId`;
- CRUD honors ownership (member ≠ owner → typed 403), 404s are typed,
  stats return a dense 30-day series;
- presigned uploads work and file listings are owner-scoped per role;
- admin endpoints reject non-admins, role promotion applies after re-sign-in
  (documents the 5-minute session cookie cache);
- the points wallet cannot be double-spent: 10 concurrent
  `POST /wallet/spend` requests against the same balance resolve to exactly
  one success and nine typed `WALLET_INSUFFICIENT_BALANCE` (see
  `docs/database.md`, "Transactions").

Suites run with `fileParallelism: false` — each file boots a full app.
First run pulls container images; timeouts are sized for that.

## E2E

Runs against a live stack:

```sh
pnpm compose:dev && pnpm db:migrate && pnpm db:seed && pnpm dev
# other terminal
pnpm test:e2e
```

CI does the same with built apps (see the pipeline's `e2e` job).
`WEB_URL` overrides the base URL. Tests create unique users per run and also
exercise the seeded admin — keep them independent of each other beyond the
`describe.serial` chain they're in.

## Sharp edges (learned the hard way)

- **Nest + Vitest needs SWC with explicit decorator options** —
  `apps/api/vitest.swc.ts`. `unplugin-swc` does not read tsconfig; without
  `legacyDecorator + decoratorMetadata`, `@Inject()` metadata silently
  disappears and DI fails only at runtime.
- **Quiet logger under test** — `common/logger.ts` collapses to a single
  console transport when `NODE_ENV === "test"`; the integration suite sets
  `LOG_LEVEL=warn` to keep output readable.
- **Set env before importing app code** — `env.ts` validates at import time;
  the integration suite sets `process.env` first and then dynamically
  imports `app.setup`.
- **Don't run two Vitest processes in the template concurrently** — they
  share the Vite transform cache.

## CI map

| Job | Runs |
|---|---|
| quality | install → lint → build → typecheck → unit tests |
| integration | Testcontainers suite on the runner's Docker |
| e2e | compose `dev` profile → migrate + seed → built api/web → Playwright (chromium) |
