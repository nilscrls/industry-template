# Maintaining the template

The template is not string-templated: `template/` is a **real, runnable
turborepo** with its own lockfile, linted/built/tested in CI. The CLI copies
it and applies mechanical transforms (name, dotfiles, secrets, default
locale) plus, when a non-default option is chosen, **variant overlays** —
directories under `variants/` whose files are copied over the scaffold
(after deleting the paths in the overlay's `_delete.json`). That is the core
maintenance property — if the template builds green AND each variant
scaffold builds green (the `variants` CI job), every scaffold builds green.

## Repo layout

```
src/          CLI source (@clack/prompts) — scaffold logic is pure & tested
tests/        CLI tests, incl. scaffold smoke tests against the REAL template
template/     the reference app (its docs/ ships to every generated project)
variants/     per-option overlays: ui-base (Base UI), authz-rebac (ReBAC),
              ai-claude (AGENTS.md + CLAUDE.md + .claude/rules — applied by default)
docs/         this documentation
.github/      CI: `cli` + `template` + `variants` jobs (quality + Testcontainers)
```

## Variant overlays

- `variants/ui-base/` — Base UI (`@base-ui/react`) ports of the 7
  Radix-based `@repo/ui` components, the ui `package.json`/`components.json`,
  and the three app files that used `asChild` (render-prop conversions).
- `variants/authz-rebac/` — membership-based CASL: permission contracts,
  `project_member` schema + regenerated drizzle migrations (`_delete.json`
  removes the RBAC ones), ability factory, projects/users services and
  controllers, seeds, `docs/authorization.md`, and its own integration suite.
- `variants/ai-claude/` — AI assistant config, applied **by default**
  (`--ai=none` opts out): `AGENTS.md` (agent instructions inside
  `BEGIN/END:create-industry-app` markers; `__UI_VARIANT__` /
  `__AUTHZ_VARIANT__` / `__LOCALE_VARIANT__` tokens are stamped at scaffold
  time), a one-line `CLAUDE.md` importing it, and path-scoped
  `.claude/rules/*.md` — stored as `_claude/` in the overlay (same
  npm-publish concern as `_gitignore`; the scaffold renames it). The
  `_claude/skills/` directory holds the in-house `scaffold-feature` skill
  plus third-party skills vendored by `pnpm sync-skills`
  (`scripts/sync-skills.ts`, needs an authenticated `gh`): pinned upstream
  commits are recorded in `skills/vendored.lock.json`. Rerun it
  periodically (or before a release) to refresh; only vendor content with
  an explicit MIT/Apache-2.0 grant and keep each skill's license text
  alongside its files. **When a convention or hard-won constraint changes
  in the template, update the corresponding rule file / AGENTS.md section
  too** — the `Verify AI config` CI step only checks presence and stamping,
  not accuracy.

**When you touch a template file that has an overlay counterpart, update the
overlay too** — the `variants` CI job scaffolds each variant (and the
base+rebac combination) and runs lint/build/check-types/test against it, so
drift fails CI. CI is release-gated (push to `release/**`, `v*` tags, or
manual `workflow_dispatch`) — day-to-day pushes rely on lefthook + the local
checklist below, so run it before merging significant changes. To regenerate the ReBAC migrations after a schema change:
scaffold with `--authz=rebac`, delete `packages/db/drizzle`, run
`pnpm db:generate`, copy the folder back into the overlay.

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
7. Variants: scaffold `--ui=base`, `--authz=rebac` and the combination into
   scratch dirs; each must pass `pnpm build && pnpm check-types && pnpm lint
   && pnpm test` (and `pnpm test:integration` for rebac). CI does this on
   every release branch/tag (and on demand via `workflow_dispatch`) — mirror
   it locally before releasing.

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
| The ai-claude overlay stores `.claude/` as `_claude/`; the scaffold renames it (`restoreDotfiles`) | same npm-publish hazard as `_gitignore` — dot-entries in `files` dirs are not reliably packed |
| BullMQ gets plain connection options parsed from `REDIS_URL` | passing an ioredis instance couples to bullmq's own ioredis version (nominal type clash) |
| `NODE_ENV` is never set in `.env` / `.env.example` | the root build script injects `.env` via dotenv; a forced `NODE_ENV=development` makes `next build` mix React dev/prod builds and `/_global-error` prerendering crashes (`useContext` of null). The runtime owns NODE_ENV: next/compose/tests set it, the api defaults to `development` |

When you add a new hard-won rule, record it here **and** as a comment at the
site that would regress.

## Publishing

```sh
pnpm build && pnpm test
npm publish            # files: dist + template; prepublishOnly rebuilds
```

Sanity-check the tarball once per release: `npm pack --dry-run` — confirm
`template/**` AND `variants/**` are present, `_gitignore` files included, no
`node_modules`, and the template `pnpm-lock.yaml` ships (reproducible
installs). Version
with your release flow (`release/*` branch → tag on `main`); the package
version is independent of the template's app versions (all `0.0.0`,
private).

## Keeping the template current

Renovate updates both workspaces. Scaffold-time options are deliberately
few — **UI primitives (radix/base), authorization model (rbac/rebac),
default locale (en/fr) and AI config (claude/none, additive markdown only)**
— because every option multiplies the test matrix
(the `variants` CI job pays that cost). Before adding a new option, prefer a
documented migration guide in `template/docs/`; add an overlay only when the
choice is structural (different dependencies or data model), and wire it
into the CI matrix + `tests/scaffold.test.ts` in the same PR.
