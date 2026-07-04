# create-industry-app — CLI reference

## Usage

```sh
pnpm create industry-app [directory] [flags]
# or
npx create-industry-app my-app
```

Interactive prompts: project name (also the target directory), UI primitives,
authorization model, default language, then optional setup steps (git init,
pnpm install). Non-interactive:

```sh
npx create-industry-app my-app -- --yes            # accept all defaults
npx create-industry-app my-app -- --yes --ui=base --authz=rebac --locale=fr
```

| Flag | Effect |
|---|---|
| `[directory]` | target path; its basename becomes the default project name |
| `--ui=radix\|base` | shadcn/ui primitive library (default `radix`): Radix UI, or Base UI (`@base-ui/react`, `render`-prop composition) |
| `--authz=rbac\|rebac` | CASL authorization model (default `rbac`): global roles + per-user overrides, or per-project memberships (owner/editor/viewer) |
| `--locale=en\|fr` | default UI language (default `en`); both catalogs always ship |
| `--yes`, `-y` | skip all prompts, take defaults/flags |
| `--no-git` | skip `git init` |
| `--no-install` | skip `pnpm install` |

## Requirements

- Node **≥ 22.12** (the generated api relies on stable `require(esm)`)
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Docker (for the generated app's dev infra and integration tests)

## What scaffolding does

1. Copies `template/` into the target, skipping build artifacts
   (`node_modules`, `dist`, `.next`, `.turbo`, coverage, `.env`).
2. Applies the chosen variant overlays: `--ui=base` swaps the `@repo/ui`
   components (and the few `asChild` call sites) for Base UI ports;
   `--authz=rebac` swaps the permission contracts, db schema + migrations,
   ability factory, seeds and integration tests for the membership-based
   model.
3. Sets `DEFAULT_LOCALE` in `packages/i18n/src/config.ts` from `--locale`.
4. Renames every `_gitignore` → `.gitignore` (npm strips `.gitignore` files
   from published packages, so the template stores them prefixed).
5. Stamps the project name into the root `package.json`.
6. Materializes `.env` from `.env.example`, generating a random 64-hex
   `BETTER_AUTH_SECRET`.
7. Optionally initializes git (`main` branch) and runs `pnpm install`, then
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
pnpm db:migrate && pnpm db:seed
pnpm dev          # web :3000, api :3001
```

Everything else — architecture, features, guides, testing, deployment — is
documented inside the generated app under `docs/` and `README.md`.

## Troubleshooting

- **`pnpm install failed`** — the CLI continues and prints the manual step;
  usually a Node/pnpm version mismatch (check `node -v` ≥ 22.12).
- **Windows** — supported; the CLI shells out with `shell: true` for
  git/pnpm. Line endings are normalized to LF by the shipped
  `.gitattributes`.
- **Scaffold into an existing repo** — `git init` is skipped safely if you
  pass `--no-git`; with git enabled the CLI runs `git init -b main`, which
  is a no-op on an existing repo but the commit/branch steps still apply.
