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
              org-single, i18n-url, logging-winston, ci-gitlab, and
              ai-claude (AGENTS.md + CLAUDE.md + .claude/rules — applied by default)
docs/         this documentation
.github/      CI: `cli` + `template` + `variants` jobs (quality + Testcontainers)
```

## Variant overlays

- `variants/ui-base/` — Base UI (`@base-ui/react`) ports of the 7
  Radix-based `@repo/ui` components, the ui `package.json`/`components.json`,
  and the three app files that used `asChild` (render-prop conversions).
- `variants/authz-rebac/` — relation-based OpenFGA model: its own
  `packages/fga/model.fga` + `sync.ts`, permission contracts,
  `project_member` schema + regenerated drizzle migrations (`_delete.json`
  removes the RBAC ones), projects/users services and controllers, seeds,
  `docs/authorization.md`, and its own integration suite.
- `variants/org-single/` — single-organization mode: a UI-neutral
  `org-switcher.tsx` stub, the `packages/auth/src/auth.ts` seam it replaces
  (auto-provisions one `DEFAULT_ORG`, `allowUserToCreateOrganization: false`),
  and its own `apps/api/test/api.int.test.ts`. Applied AFTER ui-base, so its
  web files must stay UI-library-neutral (see below) — last write wins.
- `variants/i18n-url/` — URL-prefixed locales: `middleware.ts` prefix-rewrite,
  `locale-switcher.tsx`, `i18n/request.ts`, and the `lib/navigation.tsx` shim
  (`localizeHref`). Also applied after ui-base and UI-neutral.
- `variants/logging-winston/` — winston (`nest-winston`) replacements for the
  `apps/api` logger.ts / app.setup.ts / exception.filter / mail.processor /
  mail.service (+ their specs) and the api `package.json` (no `nestjs-pino`),
  plus the winston copies of `docs/stack.md`/`features.md`/`testing.md`.
- `variants/ci-gitlab/` — `.gitlab-ci.yml` (carries the `__PROD_BRANCH__`
  marker — it is listed in `PROD_BRANCH_FILES`), a `.versionrc.json`, and a
  commit-and-tag-version-flavored `docs/releases.md`; its `_delete.json`
  removes `.github/`, `release-please-config.json` and
  `.release-please-manifest.json`. The release axis overlays on top (GitLab's
  default is release-it, which replaces these release files).
- `variants/release-it-github/` and `variants/release-it-gitlab/` — the
  release axis (`--release`, validated against the CI provider via
  `CI_RELEASE_TOOLS`): `.release-it.json` (conventional-changelog plugin
  writing `apps/web/content/changelog.md`; carries `__PROD_BRANCH__` in
  `git.requireBranch`) and a release-it-flavored `docs/releases.md`. The
  github overlay's `_delete.json` removes the release-please files and adds a
  tag-triggered `.github/workflows/release.yml`; the gitlab overlay applies
  after ci-gitlab and deletes its `.versionrc.json` (the tag-triggered
  `release` job in `.gitlab-ci.yml` is shared by both gitlab release tools).
  The `release` script + `release-it` devDependencies are not overlay files —
  `addReleaseItTooling` patches the root `package.json` in `scaffold.ts`.

**UI-neutral** (for the post-ui-base overlays org-single and i18n-url) means
no variant-divergent primitives — no `DropdownMenu`, no Radix/Base-specific
APIs. org-single's org-switcher is strictly zero-`@repo/ui` (its scaffold test
asserts that). i18n-url's locale-switcher may import `@repo/ui/components/button`
— Button's API is identical in both flavors — but nothing more. Keep the two
tests' different strictness intact.

- `variants/ai-claude/` — AI assistant config, applied **by default**
  (`--ai=none` opts out): `AGENTS.md` (agent instructions inside
  `BEGIN/END:create-industry-app` markers; the `__UI_VARIANT__` /
  `__AUTHZ_VARIANT__` / `__ORG_VARIANT__` / `__LOCALE_VARIANT__` /
  `__I18N_VARIANT__` / `__LOGGING_VARIANT__` / `__API_ACCESS_VARIANT__` /
  `__CI_VARIANT__` / `__OBSERVABILITY_VARIANT__` tokens are stamped at scaffold time by
  `stampAgentsVariants`), a one-line `CLAUDE.md` importing it, and path-scoped
  `.claude/rules/*.md` — stored as `_claude/` in the overlay (same
  npm-publish concern as `_gitignore`; the scaffold renames it). Rules with
  a variant suffix (`authz.rbac.md`/`authz.rebac.md`,
  `ui.radix.md`/`ui.base.md`, `logging.pino.md`/`logging.winston.md`) are
  resolved at scaffold time — the chosen one is renamed to `<dimension>.md`,
  the others deleted (`selectVariantRules`); a new variant of any rules
  dimension (authz, ui, logging) needs a matching rule file. The org, i18n,
  ci and observability axes deliberately get **no** suffixed rule files — a
  stamped AGENTS.md bullet only. `_claude/agents/code-reviewer.md` ships a review
  subagent tuned to the constraints table below. The
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

Current mirror pairs (a template edit must be replayed in the overlay copy):

- `packages/auth/src/auth.ts` → its `variants/org-single/packages/auth/src/auth.ts`
  counterpart (any auth.ts edit — rate limiting, providers — must be replayed
  there; org-single derives its copy from the post-security template).
- `apps/api/test/api.int.test.ts` → its authz-rebac and org-single copies.
- The `apps/api` logger/mail files and api `package.json` → their
  `variants/logging-winston/` copies.
- `docs/stack.md`/`features.md`/`testing.md` → their logging-winston copies.

**Overlays never ship `.env.example`, root `package.json`,
`docker-compose.yml`, or `turbo.json`.** `stampEnvChoices`, `pruneBackup`, and
`setProjectName` run AFTER overlay application and assume the template's own
copies of those files — an overlay copy would be silently overwritten or, for
env stamping, break the fail-loud line lookup.

**Backup tooling is template content guarded by prune markers, not an
overlay.** `--backup=false` (`pruneBackup` in `src/scaffold.ts`) deletes whole
paths (`scripts/backup/`, `docs/backup.md`), strips the `# BEGIN backup` …
`# END backup` blocks from `docker-compose.yml` + `.env.example`, removes lines
matching `/backup\.md|backup:db|backup:files|restore:db|restore:files/` from
`README.md` + `docs/deployment.md`, and deletes the four
`backup:*`/`restore:*` root package scripts. Each strip is fail-loud (throws
when the markers/lines are missing), so keep every backup reference inside one
of those shapes — a backup mention added outside a marker block or on a
non-matching line will be missed by the prune and break the scaffold test.

**API access (`--api=direct`) is an anchored-edit transform, not an overlay**
(`applyDirectApi` in `src/scaffold.ts`). It runs AFTER all overlays and
rewrites exact text anchors in `apps/web/next.config.ts` (drops the `/api`
rewrite), `apps/web/src/lib/auth-client.ts`, `apps/api/src/app.setup.ts` (no
`/api` re-prefix), `apps/api/src/auth/auth.module.ts` (Better-Auth base =
`${API_PUBLIC_URL}/auth` + `cookieDomain`), `apps/api/src/config/env.ts`,
`.env.example`, `docker-compose.prod.yml` and the docs that describe the
same-origin story (`README.md`, `docs/architecture.md`, `docs/stack.md`,
`docs/deployment.md`). Each edit is fail-loud, and the anchors must stay
**byte-identical across every overlay copy of the same file** — that is why
it is a transform: `app.setup.ts` (logging-winston) and `docs/stack.md`
(logging-winston) each exist in two flavors that share the anchored text.
When you touch any of those anchor sites (template or overlay copy), update
`applyDirectApi` in the same change; the scaffold tests run it against the
real template and will throw on drift. `createAuth`'s optional `cookieDomain`
(→ Better-Auth `advanced.crossSubDomainCookies`) ships in both auth.ts copies
and is simply unused in proxy mode.

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
| Better-Auth `baseUrl` = full public base (`${WEB_URL}/api/auth`); express mount re-prefixes `/api` and registers **before** `app.init()` (with `--api=direct`: base is `${API_PUBLIC_URL}/auth`, no re-prefix) | a path in `baseURL` *replaces* `basePath` as the router mount; Nest's 404 catch-all registers at init and swallows later mounts |
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

Renovate updates both workspaces. The scaffold-time axes are:

- **UI primitives** — radix/base (overlay)
- **Authorization model** — rbac/rebac (overlay)
- **Organization model** — multi/single (overlay)
- **Default locale** — en/fr (mechanical stamp)
- **Locale routing** — cookie/url (overlay)
- **Observability** — sentry/posthog/otel multiselect (env stamp, no overlay)
- **Behavior flags** — require-email-verification/emails-enabled (env stamp)
- **API logger** — pino/winston (overlay)
- **API access** — proxy/direct (anchored text edits, no overlay)
- **CI provider** — github/gitlab (overlay)
- **Backup tooling** — keep/prune (template content + prune, no overlay)
- **AI config** — claude/none (additive markdown only)

The `variants` CI matrix is NOT the cartesian product — it is a curated set of
rows chosen so every overlay appears at least once, every overlay-pair with an
application-order constraint appears at least once (ui-base→org-single, i18n-url
after ui-base), and the env-stamping axes (observability, flags, backup) are
covered by `tests/scaffold.test.ts` copy-only assertions rather than full
builds. When you add an overlay, add one matrix row exercising it and one
scaffold test; do not multiply rows. Before adding a new option, prefer a
documented migration guide in `template/docs/`; add an overlay only when the
choice is structural (different dependencies or data model).

ORM choice (drizzle → prisma) is deliberately NOT a scaffold option: it touches
the schema, RLS policies, migrations, seeds and every service — as an overlay it
would double the whole matrix. It ships as a migration guide instead:
`template/docs/prisma-migration.md`.
