# Releases & changelog

Releases are automated with [release-please](https://github.com/googleapis/release-please)
on top of the git-flow branching model. The changelog is generated from
conventional commit messages and rendered in the app at `/changelog`
(source of truth: `apps/web/content/changelog.md`; root `CHANGELOG.md` is a
pointer).

## Release flow

The branching model itself is documented in `docs/git-flow.md`.

1. Features land on `develop` via `feature/*` PRs (conventional commits).
2. To release, merge `develop` into `__PROD_BRANCH__` (directly or via a
   `release/*` branch).
3. release-please reacts to the push and opens/updates a **release PR**
   against `__PROD_BRANCH__`: version bump in `package.json` +
   `.release-please-manifest.json`, changelog entries from the commits.
4. Merging the release PR creates the tag and the GitHub release.
5. **Back-merge `__PROD_BRANCH__` into `develop`** so the version bump and
   changelog don't regress on the next release.

## Hotfixes

1. Branch `hotfix/*` off `__PROD_BRANCH__`, commit with `fix:` (that's what
   makes release-please pick it up), PR into `__PROD_BRANCH__`.
2. release-please opens a patch release PR — merge it to tag.
3. Back-merge `__PROD_BRANCH__` into `develop`.

## Notes

- Commit types drive the changelog: `feat:` → Features, `fix:` → Bug Fixes;
  `feat!:`/`BREAKING CHANGE:` bumps the major. Write commit messages for the
  reader of the release notes.
- The changelog body is English-only by design — it is generated from
  commit messages. The `/changelog` page chrome is localized.
- Releases created with the default `GITHUB_TOKEN` don't retrigger CI on
  the tag; CI already validated the release PR.
