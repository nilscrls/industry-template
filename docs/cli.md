# create-industry-app — CLI reference

## Usage

```sh
pnpm create industry-app [directory] [flags]
# or
npx create-industry-app my-app
```

Interactive prompts: project name (also the target directory), UI primitives,
authorization model, organization model, default language, locale routing,
API access, observability, behavior flags, API logger, CI provider, release tooling,
backup tooling, AI assistant config, then optional setup steps (git init,
pnpm install).
Non-interactive:

```sh
npx create-industry-app my-app -- --yes            # accept all defaults
npx create-industry-app my-app -- --yes --ui=base --authz=rebac --org=single --i18n=url --ci=gitlab
```

| Flag | Effect |
|---|---|
| `[directory]` | target path; its basename becomes the default project name |
| `--ui=radix\|base` | shadcn/ui primitive library (default `radix`): Radix UI, or Base UI (`@base-ui/react`, `render`-prop composition) |
| `--authz=rbac\|rebac` | OpenFGA authorization model (default `rbac`): global roles + per-user grants, or per-project relations (owner/editor/viewer) |
| `--org=multi\|single` | organization model (default `multi`): org switcher + invitations, or one implicit organization |
| `--locale=en\|fr` | default UI language (default `en`); both catalogs always ship |
| `--i18n=cookie\|url` | locale routing (default `cookie`): cookie-stored locale, or URL-prefixed paths (`/fr/...`) via middleware rewrite |
| `--api=proxy\|direct` | how the browser reaches the API (default `proxy`): same-origin `/api` via the Next.js rewrite (no CORS), or direct-to-API on its own origin — e.g. `api.example.com` next to `app.example.com`. `direct` drops the rewrite, points the web app + Better-Auth at `API_PUBLIC_URL`, and scopes the session cookie to the shared parent domain (`COOKIE_DOMAIN`) so cookies work across the subdomains (same-site, `SameSite=Lax` unchanged) |
| `--observability=sentry,posthog,otel\|none` | comma-separated collectors to enable (default `none`); everything ships wired but disabled — this stamps the matching `*_ENABLED` vars to `true` in `.env.example`/`.env` |
| `--flags=require-email-verification,emails-enabled\|none` | env-driven behavior flags (default `emails-enabled`); stamps `REQUIRE_EMAIL_VERIFICATION` / `EMAILS_ENABLED` into `.env.example`/`.env` |
| `--logging=pino\|winston` | API logger (default `pino`) |
| `--ci=github\|gitlab` | CI provider (default `github`): GitHub Actions, or `.gitlab-ci.yml` |
| `--release=release-please\|release-it\|commit-and-tag-version` | release tooling, validated against `--ci`. GitHub: `release-please` (default — bot maintains a release PR) or `release-it` (run `pnpm release` locally; a tag-triggered workflow publishes the GitHub Release). GitLab: `release-it` (default) or `commit-and-tag-version` (npx, no devDependencies) — both rely on the tag-triggered `release` job in `.gitlab-ci.yml` |
| `--backup` / `--no-backup` | keep or prune the Postgres backup/restore tooling (default keep; interactive confirm) |
| `--ai=claude\|none` | AI assistant config (default `claude`): `AGENTS.md` (agent instructions, stamped with the chosen variants), `CLAUDE.md` (imports it), path-scoped `.claude/rules/` (incl. authz/ui rules matching the chosen variants), `.claude/skills/` (the `scaffold-feature` generator workflow + vendored Vercel/Anthropic skills, provenance in `vendored.lock.json`) and a `code-reviewer` agent |
| `--yes`, `-y` | skip all prompts, take defaults/flags |
| `--no-git` | skip `git init` |
| `--no-install` | skip `pnpm install` |

## Requirements

- Node **≥ 22.13** (the generated api relies on stable `require(esm)`)
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Docker (for the generated app's dev infra and integration tests)

## What scaffolding does

1. Copies `template/` into the target, skipping build artifacts
   (`node_modules`, `dist`, `.next`, `.turbo`, coverage, `.env`).
2. Applies the chosen variant overlays: `--ui=base` swaps the `@repo/ui`
   components (and the few `asChild` call sites) for Base UI ports;
   `--authz=rebac` swaps the permission contracts, db schema + migrations,
   ability factory, seeds and integration tests for the membership-based
   model; `--org=single` swaps the org switcher + auth config for
   single-organization mode; `--i18n=url` swaps the middleware/navigation for
   URL-prefixed locales; `--logging=winston` swaps the api logger stack;
   `--ci=gitlab` replaces `.github/` + release-please with a `.gitlab-ci.yml`;
   `--release=release-it` swaps the CI provider's default release files for
   `.release-it.json` + a release-it-flavored `docs/releases.md` (on GitHub
   also a tag-triggered `release.yml`) and adds the `release` script and
   `release-it` devDependencies to the root `package.json`.
3. Unless `--ai=none`, applies the `ai-claude` overlay — `AGENTS.md`,
   `CLAUDE.md` (a one-line `@AGENTS.md` import) and `.claude/rules/` — and
   stamps the chosen variants (ui, authz, org, locale, i18n, logging, ci,
   release, observability) into `AGENTS.md`. The managed
   content sits between `BEGIN:create-industry-app` markers; edits outside
   them survive template upgrades.
4. Sets `DEFAULT_LOCALE` in `packages/i18n/src/config.ts` from `--locale`.
   With `--api=direct`, rewires API access by anchored text edits (no
   overlay): removes the Next.js `/api` rewrite, points the web api/auth
   clients at the API origin, moves Better-Auth's public base to
   `${API_PUBLIC_URL}/auth` with a parent-domain (`COOKIE_DOMAIN`) session
   cookie, adds both env vars, and updates the docs/compose examples to
   subdomain routing.
5. Renames every `_gitignore` → `.gitignore` and `_claude/` → `.claude/`
   (npm strips or mangles dot-entries in published packages, so the template
   and overlays store them prefixed).
6. Stamps the project name into the root `package.json`.
7. Stamps the observability and behavior-flag choices into `.env.example`
   (and therefore `.env`); with `--no-backup`, removes `scripts/backup/`,
   `docs/backup.md`, the compose `backup` block, the `BACKUP_*` env vars and
   the four backup/restore package scripts.
8. Materializes `.env` from `.env.example`, generating a random 64-hex
   `BETTER_AUTH_SECRET`.
9. Optionally initializes git (`main` branch) and runs `pnpm install`, then
   commits the scaffold and creates a `develop` branch — ready for
   git-flow-next. (The repo is created before the install so the template's
   `prepare` script can register git hooks; the commit happens after so the
   lockfile lands in the initial commit.)

The scaffolder refuses a non-empty target directory (a lone `.git/` is
allowed, so you can scaffold into a freshly created repo).

## After scaffolding

```sh
cd my-app
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile dev up -d
pnpm fga:bootstrap          # OpenFGA store + model (writes FGA_STORE_ID to .env)
pnpm db:migrate && pnpm db:seed
pnpm dev          # web :3000, api :3001
```

Everything else — architecture, features, guides, testing, deployment — is
documented inside the generated app under `docs/` and `README.md`.

## Troubleshooting

- **`pnpm install failed`** — the CLI continues and prints the manual step;
  usually a Node/pnpm version mismatch (check `node -v` ≥ 22.13).
- **Windows** — supported; the CLI shells out with `shell: true` for
  git/pnpm. Line endings are normalized to LF by the shipped
  `.gitattributes`.
- **Scaffold into an existing repo** — `git init` is skipped safely if you
  pass `--no-git`; with git enabled the CLI runs `git init -b main`, which
  is a no-op on an existing repo but the commit/branch steps still apply.
