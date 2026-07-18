# Contributing

## Branching model (git-flow)

The full walkthrough (commands, release steps, back-merge rationale) is in
[docs/git-flow.md](docs/git-flow.md); the release tooling is documented in
[docs/releases.md](docs/releases.md).

- `__PROD_BRANCH__` — production. Every commit on it is releasable; releases
  are tagged here.
- `develop` — integration. Day-to-day work lands here.
- `feature/<slug>` — branched from `develop`, merged back into `develop` via PR.
- `release/<version>` — branched from `develop` when preparing a release,
  merged into `__PROD_BRANCH__` **and** back into `develop`.
- `hotfix/<slug>` — branched from `__PROD_BRANCH__` for urgent production
  fixes, merged into `__PROD_BRANCH__` **and** back into `develop` so the fix
  is never lost on the next release.

```
feature/* ──▶ develop ──(release/*)──▶ __PROD_BRANCH__
                 ▲                        │
                 └────── back-merge ──────┘
```

## Commits

Conventional Commits, enforced by commitlint on `commit-msg`. Use
`pnpm commit` for a guided prompt. Commit types drive the generated
changelog, so write messages for the reader of the release notes.

## Hooks (lefthook)

- pre-commit: Biome on staged files
- commit-msg: commitlint
- pre-push: typecheck

## Checks before a PR

```sh
pnpm lint && pnpm check-types && pnpm test
```

CI runs the same plus integration (Testcontainers) and e2e (Playwright) on
PRs and on pushes to `__PROD_BRANCH__` and `develop`.
