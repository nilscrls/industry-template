# create-industry-app — CLI reference

## Usage

```sh
pnpm create industry-app [directory] [flags]
# or
npx create-industry-app my-app
```

Interactive prompts: project name (also the target directory), then optional
setup steps (git init, pnpm install). Non-interactive:

```sh
npx create-industry-app my-app -- --yes            # accept all defaults
npx create-industry-app my-app -- --yes --no-git --no-install
```

| Flag | Effect |
|---|---|
| `[directory]` | target path; its basename becomes the default project name |
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
2. Renames every `_gitignore` → `.gitignore` (npm strips `.gitignore` files
   from published packages, so the template stores them prefixed).
3. Stamps the project name into the root `package.json`.
4. Materializes `.env` from `.env.example`, generating a random 64-hex
   `BETTER_AUTH_SECRET`.
5. Optionally `pnpm install`.
6. Optionally initializes git: `main` branch, initial conventional commit,
   plus a `develop` branch — ready for git-flow-next.

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
