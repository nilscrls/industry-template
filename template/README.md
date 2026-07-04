# Industry App

Industrial-grade full-stack TypeScript monorepo, scaffolded by `create-industry-app`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, shadcn/ui (Tailwind v4), TanStack Query/Table, react-hook-form, next-intl, next-themes, recharts |
| Backend | NestJS 11, Better-Auth, CASL, Drizzle (Postgres), Redis, BullMQ, Minio (S3), nestjs-pino |
| Contract | oRPC — one zod contract in `packages/contracts`, live end-to-end types, OpenAPI at `/api/openapi.json` |
| Quality | Biome (ultracite), Vitest, Testcontainers, Playwright, lefthook + commitlint |

## Quickstart

```sh
pnpm install
pnpm compose:dev            # postgres, redis, minio, maildev (ports exposed)
pnpm db:migrate && pnpm db:seed
pnpm dev                    # web on :3000, api on :3001
```

Seeded logins (`Password123!`): `admin@example.com`, `manager@example.com`, `member@example.com`.
Maildev UI: <http://localhost:1080> · Minio console: <http://localhost:9001>.

## Documentation

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | monorepo layout, request lifecycle, contract-first types, auth/authz design, error pipeline, the CJS decision |
| [docs/authorization.md](docs/authorization.md) | this project's permission model (chosen at scaffold time), management endpoints, how to change rules |
| [docs/stack.md](docs/stack.md) | every technology, its role, and why it was chosen |
| [docs/features.md](docs/features.md) | feature-by-feature: where the code lives, how to use it |
| [docs/guides.md](docs/guides.md) | recipes: add a feature/endpoint/permission/error code/locale/env var/email, conventions |
| [docs/testing.md](docs/testing.md) | test pyramid, TDD loop, integration-test pattern, sharp edges |
| [docs/deployment.md](docs/deployment.md) | compose profiles, reverse proxy, env matrix, scaling, day-2 ops |

## How the pieces fit

- **One contract.** `packages/contracts` holds zod schemas, the oRPC contract, the error
  catalog, and permission definitions. The api implements it (`@orpc/nest` in real Nest
  controllers), the web consumes it (typed client + TanStack Query utils). Change a field
  → both sides fail to compile.
- **Same-origin API.** The browser only calls `/api/*` on the web origin; Next rewrites to
  the api in dev, the reverse proxy routes it in prod. No CORS, no cookie domain pain.
- **Auth.** Better-Auth lives on the api (`/api/auth/*`), sessions in Postgres with a Redis
  secondary storage and a 5-minute signed cookie cache. Emails (verification, reset) render
  with react-email and send through a BullMQ queue with retries.
- **Authorization.** Serializable CASL rules (model chosen at scaffold time — see
  `docs/authorization.md`). The api builds a CASL ability per request (rules cached in
  Redis); the web builds the *same* ability from `/api/me/permissions` to show/hide UI.
  The api is the authority — UI gating is cosmetic.
- **Errors.** Everything serializes to `{ code, params, traceId }`. `code` maps to a
  translation in `packages/i18n/messages/*`; `traceId` matches the api log line.
- **Files.** The api presigns Minio PUT/GET URLs; bytes never stream through Nest.
- **Logging.** Pretty in dev, JSON on stdout in prod, optional daily-rotated files via
  `LOG_FILE_ENABLED=true` (pino-roll). Every line carries the request's `traceId`.

## Scripts

```sh
pnpm dev / build / lint / check-types / test
pnpm test:integration       # Testcontainers (needs Docker)
pnpm test:e2e               # Playwright against a running stack
pnpm db:generate            # drizzle migration from schema changes
pnpm db:migrate / db:seed
pnpm gen feature            # scaffold a vertical slice (contract → db → api → web)
pnpm commit                 # commitizen-style guided commit (cz-git)
pnpm compose:all            # full stack in docker (dev ports)
pnpm compose:prod           # prod overlay: external `proxy` network, no host ports
```

## TDD loop

1. `pnpm gen feature` → contract, schema, api module, and `it.todo` integration specs.
2. Turn a todo into a real test (pattern in `apps/api/test/api.int.test.ts`), watch it fail.
3. Implement until green: `pnpm --filter @repo/api test:integration`.
4. Unit-test pure logic next to the source (`*.spec.ts` / `*.test.ts`).

## Workflow

git-flow-next branches: `main` (production), `develop` (integration), `feature/*`,
`release/*`, `hotfix/*`. Commits follow Conventional Commits — use `pnpm commit`.
Hooks (lefthook): biome on staged files, commitlint on messages, typecheck on push.

## Deployment

`docker-compose.prod.yml` attaches `web` and `api` to an external `proxy` network
(create once: `docker network create proxy`) — point your reverse proxy at
`web:3000` and route `PathPrefix(/api)` → `api:3001` (strip the prefix). The
`migrate` one-shot service applies drizzle migrations before the api starts.
Set real values in `.env` (secrets, SMTP, S3) and `NEXT_PUBLIC_API_URL=https://your.domain/api`.
