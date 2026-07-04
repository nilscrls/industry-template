# Maintaining the template

The template is not string-templated: `template/` is a **real, runnable
turborepo** with its own lockfile, linted/built/tested in CI. The CLI copies
it and applies only mechanical transforms (name, dotfiles, secrets). That is
the core maintenance property — if the template builds green, every scaffold
builds green.

## Repo layout

```
src/          CLI source (@clack/prompts) — scaffold logic is pure & tested
tests/        CLI tests, incl. a scaffold smoke test against the REAL template
template/     the reference app (its docs/ ships to every generated project)
docs/         this documentation
.github/      CI: `cli` job + `template` job (quality + Testcontainers)
```

## Development workflow

```sh
pnpm install && pnpm test          # CLI: lint, types, build, 10 tests
pnpm dev ../scratch-app            # run the CLI from source

cd template && pnpm install        # the template is its own workspace
pnpm exec turbo run build check-types test    # 16 tasks, all must pass
pnpm exec biome check .            # 0 findings expected
pnpm --filter @repo/api test:integration      # Testcontainers (needs Docker)
```

Branches follow git-flow-next (`main`/`develop`, `feature/*`); commits are
conventional (`pnpm commit`); lefthook runs biome + commitlint + typecheck.

## Full verification checklist

Run before releasing, and before accepting majors of **biome/ultracite,
oRPC, TanStack Query, drizzle, better-auth**:

1. Root: `pnpm lint && pnpm check-types && pnpm build && pnpm test`
   (the last test scaffolds the real template into a temp dir).
2. Template: `turbo run build check-types test` + `biome check .`.
3. Template: `pnpm --filter @repo/api test:integration` — the suite that
   catches what static checks can't (DI wiring, auth mounting, error
   serialization over real HTTP).
4. Template: `pnpm --filter @repo/web build` (Next production build).
5. Compose sanity: `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile dev config --quiet`
   and the prod overlay equivalent.
6. Scaffold smoke: run the CLI into a scratch dir, `pnpm install`, `pnpm dev`.

## Constraints that must not regress

Each of these broke once; the integration suite guards most of them.

| Constraint | Why |
|---|---|
| Internal packages compile to **CJS** (no `"type": "module"`); `library.json` sets `verbatimModuleSyntax: false`; scripts use `main().catch()`, never top-level await | the CJS Nest app and ESM-typed deps (drizzle) must resolve ONE type identity per dependency, or nominal private fields collide (TS2322 storms) |
| DI tokens live in `*.constants.ts`, never in the Nest module file | module-file tokens create circular imports; the token evaluates `undefined` inside `@Inject()` — at runtime, in both CJS and vitest |
| `style/useImportType` stays **off** for `apps/api` | biome converts DI-injected classes to `import type`, silently erasing the metadata Nest resolves constructors from |
| `apps/api/vitest.swc.ts` keeps explicit `legacyDecorator + decoratorMetadata` | unplugin-swc does not read tsconfig; without it `@Inject()` metadata vanishes under vitest |
| No pino `transport` when `NODE_ENV === "test"` | transports spawn worker threads that crash vitest's forked workers |
| Better-Auth `baseUrl` = full public base (`${WEB_URL}/api/auth`); express mount re-prefixes `/api` and registers **before** `app.init()` | a path in `baseURL` *replaces* `basePath` as the router mount; Nest's 404 catch-all registers at init and swallows later mounts |
| Server handler inputs typed from schema **outputs**, never `InferContractRouterInputs` | that type is the client input view; `z.coerce` fields become `unknown` |
| `migrate.ts` uses `__dirname` (with a biome-ignore) | the unsafe autofix rewrites it to `import.meta.dirname`, which breaks CJS |
| Template dotfiles stored as `_gitignore`; template `biome.jsonc` sets `vcs.useIgnoreFile: false` | npm strips `.gitignore` from packages; biome would otherwise demand the missing ignore file |
| BullMQ gets plain connection options parsed from `REDIS_URL` | passing an ioredis instance couples to bullmq's own ioredis version (nominal type clash) |

When you add a new hard-won rule, record it here **and** as a comment at the
site that would regress.

## Publishing

```sh
pnpm build && pnpm test
npm publish            # files: dist + template; prepublishOnly rebuilds
```

Sanity-check the tarball once per release: `npm pack --dry-run` — confirm
`template/**` is present, `_gitignore` files included, no `node_modules`,
and the template `pnpm-lock.yaml` ships (reproducible installs). Version
with your release flow (`release/*` branch → tag on `main`); the package
version is independent of the template's app versions (all `0.0.0`,
private).

## Keeping the template current

Renovate updates both workspaces. The template intentionally has **no
scaffold-time options** — one paved road, options multiply the test matrix.
If a variant is truly needed (e.g. another database), prefer a documented
migration guide in `template/docs/` over a CLI flag.
