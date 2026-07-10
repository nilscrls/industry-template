<!-- BEGIN:create-industry-app -->
<!-- Managed by create-industry-app: template upgrades regenerate everything
     between the BEGIN/END markers. Put project-specific instructions below
     the END marker (or in .claude/rules/) so they survive upgrades. -->

# Agent instructions

This file is the source of truth for AI coding agents. `CLAUDE.md` imports it
(`@AGENTS.md`), so it serves Claude Code and every AGENTS.md-compatible tool.

## What this repository is

A full-stack TypeScript monorepo (pnpm 10 workspaces + Turborepo 2,
Node >= 22.12) scaffolded by create-industry-app with these choices:

- UI primitives: __UI_VARIANT__
- Authorization model: __AUTHZ_VARIANT__
- Default locale: __LOCALE_VARIANT__

Layout:

- `apps/api` — NestJS 11 (Express, **CommonJS**), oRPC contract-first API,
  Drizzle ORM (Postgres 17, row-level security), Better-Auth, OpenFGA,
  BullMQ + ioredis, pino.
- `apps/web` — Next.js 16 App Router, TanStack Query/Table, next-intl,
  react-hook-form, nuqs.
- `packages/` — `contracts` (oRPC contracts + Zod schemas), `db` (Drizzle
  schema/migrations/seeds), `auth`, `emails` (react-email), `i18n`
  (next-intl config + message catalogs), `ui` (owned shadcn/ui source),
  `typescript-config`.

Deeper documentation ships in `docs/` — `architecture.md`, `stack.md`,
`features.md`, `authorization.md`, `testing.md`, `guides.md`,
`deployment.md`. Read the relevant one before structural changes.
Path-scoped conventions live in `.claude/rules/`; `.claude/skills/` ships
`scaffold-feature` (the `pnpm gen` workflow) plus vendored Vercel/Anthropic
skills (React performance, Next.js dev-loop verification, webapp testing —
provenance in `skills/vendored.lock.json`).

## Commands

Run from the repo root. Scripts wrap turbo and inject `.env` via dotenv-cli —
never bypass them by exporting env vars manually.

| Command | Effect |
| --- | --- |
| `pnpm compose:dev` | start dev infra (Postgres, Redis, Minio, maildev) |
| `pnpm dev` | build packages, then run web (:3000) + api (:3001) |
| `pnpm build` / `pnpm check-types` | production build / typecheck everything |
| `pnpm lint` / `pnpm lint:fix` | Biome (ultracite presets) check / autofix |
| `pnpm test` | unit tests (Vitest) |
| `pnpm test:integration` | api integration tests (Testcontainers — needs Docker) |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migration flow |
| `pnpm auth:schema` | regenerate the Better-Auth Drizzle schema |
| `pnpm gen` | scaffold a new feature module (contract + Nest module + tests + page) |
| `pnpm commit` | conventional commit prompt (commitlint enforces the format) |

For a new backend feature, start from `pnpm gen` instead of hand-writing the
module — it wires the contract, controller, service, module, integration
test and web page skeleton consistently.

## Non-negotiable conventions

These broke once and must not regress. Rationale lives next to each
constraint site and in `docs/`.

1. **Strict env.** No `.default()` or `??` fallback on any env var — a
   missing var must reject at startup. Every new var goes into
   `.env.example` (the complete inventory) and into the integration-test
   env setup.
2. **Never set `NODE_ENV`** in `.env` / `.env.example`. The runtime owns it;
   forcing it breaks `next build`.
3. **Internal packages compile to CommonJS** (no `"type": "module"`) because
   the Nest app is CJS. Exceptions: `@repo/ui` and `@repo/i18n` are
   source-exported ESM, web-only — never import them from the api. In those
   two packages, relative imports must be extensionless (`./config`, not
   `./config.js`).
4. **Contract-first API.** Endpoints are declared in `packages/contracts`
   (oRPC + Zod) and implemented in `apps/api`; the web client consumes the
   typed contract. Change the contract first, then the implementation.
5. **Type server handler inputs from schema outputs** (e.g. the inferred
   output of the Zod schema), never `InferContractRouterInputs` — that is
   the client-side input view and turns `z.coerce` fields into `unknown`.
6. **Don't fight Biome/ultracite suppressions.** Existing `biome-ignore`
   comments and disabled rules (e.g. `style/useImportType` off for
   `apps/api`) each guard a runtime failure — never "clean them up".
7. **Conventional commits** via `pnpm commit`; lefthook runs Biome,
   commitlint and typecheck on commit. Branches follow git-flow
   (`__PROD_BRANCH__`/`develop`, `feature/*`).

## Verifying changes

Before declaring a change done: `pnpm lint && pnpm check-types && pnpm test`.
For api changes that touch DI wiring, auth, or the HTTP surface, also run
`pnpm test:integration` — static checks cannot catch those failures.

<!-- END:create-industry-app -->
