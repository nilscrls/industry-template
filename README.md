# create-industry-app

Scaffolds an industrial-grade, production-ready full-stack TypeScript monorepo:

- **Frontend** — Next.js 16, shadcn/ui as a workspace package (Radix or Base UI, Tailwind v4), TanStack Query/Table with URL-driven filters (nuqs), react-hook-form, next-intl as a workspace package (en/fr), dark mode, recharts
- **Backend** — NestJS 11, Better-Auth, CASL (RBAC roles+overrides or ReBAC memberships — your pick), Drizzle (Postgres), Redis cache, BullMQ, Minio (presigned), nestjs-pino
- **Contract** — oRPC: one zod contract package, live end-to-end type safety, OpenAPI for free
- **Quality** — Vitest (unit) + Testcontainers (integration) + Playwright (e2e), Biome/ultracite, lefthook + commitlint (commitizen style), git-flow-next
- **Ops** — t3-env, docker compose profiles (`dev` / `all`) with dev/prod overlay merging, multi-stage Dockerfiles via `turbo prune`, GitHub Actions

## Usage

```sh
pnpm create industry-app my-app
# or
npx create-industry-app my-app -- --yes --no-install
```

Prompts (or flags): UI primitives `--ui=radix|base`, authorization model
`--authz=rbac|rebac`, default language `--locale=en|fr`, plus `--yes` accept
defaults (radix/rbac/en), `--no-git`, `--no-install`.

## Documentation

| Doc | Covers |
|---|---|
| [docs/cli.md](docs/cli.md) | CLI flags, requirements, what scaffolding does, troubleshooting |
| [docs/maintaining-the-template.md](docs/maintaining-the-template.md) | developing the template, verification checklist, non-regression constraints, publishing |
| [template/docs/](template/docs/) | shipped with every generated app: architecture, stack, features, guides, testing, deployment |

## Repository layout

```
src/        CLI source (@clack/prompts)
tests/      CLI tests (vitest)
template/   the reference app — a real, runnable turborepo, tested in CI
variants/   file overlays applied on top of the template per CLI choice
docs/       generator documentation
```

The template is not string-templated: it is a working monorepo (`template/` has its own lockfile and CI job). The CLI copies it, applies the chosen variant overlays (`variants/ui-base`, `variants/authz-rebac`), restores `_gitignore` → `.gitignore` (npm strips dotfiles from packages), stamps the project name and default locale, and materializes `.env` with generated secrets.

## Development

```sh
pnpm install          # CLI deps
pnpm test             # scaffolder tests (includes a real-template smoke test)
pnpm dev ../tmp-app   # run the CLI from source against a scratch directory
cd template && pnpm install && pnpm test   # work on the template itself
```

Contributions follow git-flow-next (`main`/`develop`, `feature/*`, `release/*`, `hotfix/*`) with conventional commits (`pnpm commit`).
