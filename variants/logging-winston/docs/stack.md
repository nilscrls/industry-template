# Stack

Every choice below is replaceable, but each was picked deliberately. The
"why" column records the reasoning so future changes are arguments against
reasons, not against habits.

## Shared

| Tech | Role | Why |
|---|---|---|
| pnpm 10 + turborepo 2 | workspace + task graph, remote-cacheable pipeline | strict node_modules, `turbo prune` for slim Docker builds |
| TypeScript 5.9 (strict) | everywhere | `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` on |
| zod 4 | validation + type inference | one schema drives contract, forms, env, seeds |
| oRPC | end-to-end typed API | contract-first like ts-rest but with an official NestJS adapter, first-class TanStack Query utils and OpenAPI output; no codegen step |
| Biome + ultracite v7 | lint + format | one fast tool, per-stack presets (`core/react/next/nestjs/tanstack/vitest`) |
| Vitest 3 | unit + integration runner | ESM-native, fast watch (TDD), SWC plugin for Nest decorators |
| Playwright | e2e | real browser + mobile viewport project |
| lefthook + commitlint + cz-git | hooks & conventional commits | lefthook is monorepo-native and fast; `pnpm commit` guides the format |
| t3-env (`@t3-oss/env-core` / `env-nextjs`) | typed environment | env is validated at boot/build, not at first crash |

## Backend (`apps/api`)

| Tech | Role | Why |
|---|---|---|
| NestJS 11 (express, CJS) | HTTP framework, DI, guards | the structured-team framework; oRPC implements the contract inside real controllers |
| Better-Auth | authentication | framework-agnostic, owns its schema, admin plugin, Redis secondary storage |
| OpenFGA | authorization | Zanzibar-style relation model (`packages/fga/model.fga`), tuples mirror the DB, deny-wins grants; Postgres RLS underneath for tenant isolation |
| Drizzle ORM | Postgres access | fully inferred types (the point of this stack), `drizzle-kit` migrations, first-class better-auth adapter. TypeORM was rejected for weak inference and migration DX |
| ioredis | cache, ability-rule cache, better-auth storage, throttle storage | one Redis, many jobs |
| BullMQ (`@nestjs/bullmq`) | background jobs (auth emails) | retries + exponential backoff off the request path |
| nest-winston / winston 3 | logging | JSON to stdout (12-factor); Nest-style pretty console in dev; optional `winston-daily-rotate-file` daily rotation behind `LOG_FILE_ENABLED` |
| @aws-sdk/client-s3 + presigner | Minio / any S3 | browser uploads via presigned PUT/GET; bytes never stream through Nest |
| @nestjs/terminus | `/health/live`, `/health/ready` | wired to compose healthchecks and `depends_on` |
| @nestjs/throttler + redis storage | rate limiting | shared counters across instances |
| nodemailer + react-email | mail transport + templates | maildev in dev, any SMTP in prod |
| Testcontainers | integration tests | real Postgres/Redis, no mocks |

## Frontend (`apps/web`)

| Tech | Role | Why |
|---|---|---|
| Next.js 16 (App Router, standalone output) | UI framework | `/api` rewrite makes the whole app same-origin |
| shadcn/ui + Tailwind 4 | components + styling | components are owned source in `packages/ui` (Radix or Base UI, chosen at scaffold time), not a dependency; `components.json` configured for the shadcn CLI |
| TanStack Query 5 | server state | cache, optimistic updates, invalidation; fed by oRPC query utils |
| TanStack Table 8 | tables | headless; server-driven pagination, filtering and sorting |
| nuqs 2 | URL state | typed search-param parsers derived from contract literals; the projects table state (page/search/status/sort) lives in the URL |
| react-hook-form + `@hookform/resolvers` | forms | shadcn `Form` primitives are RHF-based; schemas come from `@repo/contracts` |
| next-intl 4 | i18n (en/fr) | cookie-based locale — app-style UI, no locale in URLs; config + typed catalogs in `packages/i18n` |
| next-themes | dark/light mode | class strategy matching the shadcn token setup |
| sonner | action feedback | success/error toasts from `useAppMutation` |
| recharts 3 | dashboard charts | shadcn's chart convention; themed via `--chart-*` tokens |
| lucide-react | icons | shadcn default |

## Infrastructure

| Tech | Role |
|---|---|
| Postgres 17 | primary database |
| Redis 7 | cache, sessions, queues, rate limits |
| Minio | S3-compatible object storage (console on :9001) |
| maildev | dev SMTP + inbox UI on :1080 (dev profile only) |
| Docker Compose | `dev` profile = infra only; `all` profile = infra + apps; `docker-compose.dev.yml` exposes host ports, `docker-compose.prod.yml` joins the external `proxy` network |
| CI pipeline | quality → integration (Testcontainers) → e2e (compose) |
| Renovate | dependency updates with conventional commits |

## Version policy

Ranges are carets against known-good majors; Renovate keeps them current.
Before accepting majors of **biome/ultracite, oRPC, TanStack Query, drizzle,
better-auth**, run the full verification (`docs/testing.md`) — these five are
the ones with template-visible integration surface.
