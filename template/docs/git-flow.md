# Git flow

The branching model, independent of the release tooling chosen at scaffold
time — the tool-specific release steps live in `docs/releases.md`.

## Branches

| Branch | Role | Branched from | Merges into |
|---|---|---|---|
| `__PROD_BRANCH__` | production — every commit is releasable; releases are tagged here | — | — |
| `develop` | integration — day-to-day work lands here | `__PROD_BRANCH__` (once, at project start) | `__PROD_BRANCH__` (at release time) |
| `feature/<slug>` | one unit of work | `develop` | `develop` (PR/MR) |
| `release/<version>` | optional release stabilization | `develop` | `__PROD_BRANCH__` **and** `develop` |
| `hotfix/<slug>` | urgent production fix | `__PROD_BRANCH__` | `__PROD_BRANCH__` **and** `develop` |

```
feature/* ──▶ develop ──(release/*)──▶ __PROD_BRANCH__ ──▶ tag vX.Y.Z
                 ▲                        │
                 └─── back-merge ─────────┘        hotfix/* branches off and
                                                   merges back into __PROD_BRANCH__
```

The scaffolder leaves a fresh repo on `develop` with `__PROD_BRANCH__`
already created — compatible with `git flow init` /
[git-flow-next](https://git-flow.sh/) defaults, but plain `git` works fine:

```sh
git checkout -b feature/invoice-export develop   # start work
# … conventional commits (pnpm commit for a guided prompt) …
git push -u origin feature/invoice-export        # open a PR/MR into develop
```

## Releasing

1. Make `__PROD_BRANCH__` match what you want to ship: merge `develop` into
   it directly, or cut a `release/<version>` branch from `develop` first if
   you need to stabilize while `develop` moves on.
2. Run the release tooling — see `docs/releases.md` for this project's setup
   (version bump, changelog, tag and the CI job that publishes the release).
3. **Back-merge `__PROD_BRANCH__` into `develop`:**

   ```sh
   git checkout develop && git merge --no-ff __PROD_BRANCH__ && git push
   ```

   The release commit (version bump + changelog) only exists on
   `__PROD_BRANCH__`; without the back-merge the next release would compute
   the wrong version and regenerate old changelog entries.

## Hotfixes

```sh
git checkout -b hotfix/broken-login __PROD_BRANCH__
# fix, commit as fix: … (drives the patch bump), PR/MR into __PROD_BRANCH__
```

Then release (step 2 above) and back-merge (step 3). If `develop` has
diverged a lot, resolve conflicts in the back-merge — never cherry-pick the
fix and skip the merge, or the branches drift permanently.

## Conventions & guardrails

- **Commits** are [Conventional Commits](https://www.conventionalcommits.org),
  enforced by commitlint on `commit-msg`; `feat:`/`fix:`/`feat!:` decide the
  next version and the changelog, so write them for the release-notes reader.
- **Protect** `__PROD_BRANCH__` and `develop` in your host's settings:
  require PRs/MRs and green CI; allow only maintainers (plus the release
  tooling, if it pushes) to push `__PROD_BRANCH__` and `v*` tags.
- CI runs on PRs/MRs and on pushes to `__PROD_BRANCH__` and `develop`; tag
  pipelines only publish the release (the commit was already validated on
  `__PROD_BRANCH__`).
