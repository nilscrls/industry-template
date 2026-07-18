# Releases & changelog

Releases are driven by [release-it](https://github.com/release-it/release-it)
with the [conventional-changelog plugin](https://github.com/release-it/conventional-changelog)
(version bump + changelog from conventional commits, run locally via
`pnpm release` — no server-side bot) plus a tag-triggered GitLab Release job
in `.gitlab-ci.yml`. The changelog is rendered in the app at `/changelog`
(source of truth: `apps/web/content/changelog.md`; root `CHANGELOG.md` is a
pointer). `.release-it.json` holds the configuration.

## Release flow

The branching model itself is documented in `docs/git-flow.md`.

1. Features land on `develop` via `feature/*` merge requests (conventional
   commits).
2. To release, merge `develop` into `__PROD_BRANCH__` (directly or via a
   `release/*` branch).
3. On an up-to-date `__PROD_BRANCH__` checkout, run:

   ```sh
   pnpm release
   ```

   release-it computes the next version from the commits, prepends the new
   entries to `apps/web/content/changelog.md`, commits
   `chore: release vX.Y.Z`, tags `vX.Y.Z` and pushes branch + tag (each step
   asks for confirmation; pass `--ci` to skip the prompts).
4. The pipeline validates the branch push; the tag pipeline's `release` job
   publishes the GitLab Release.
5. **Back-merge `__PROD_BRANCH__` into `develop`** so the version bump and
   changelog don't regress on the next release.

## Hotfixes

1. Branch `hotfix/*` off `__PROD_BRANCH__`, commit with `fix:` (that's what
   drives the patch bump), MR into `__PROD_BRANCH__`.
2. Run `pnpm release` on `__PROD_BRANCH__` for a patch release.
3. Back-merge `__PROD_BRANCH__` into `develop`.

## Notes

- Commit types drive the changelog: `feat:` → Features, `fix:` → Bug Fixes;
  `feat!:`/`BREAKING CHANGE:` bumps the major. Write commit messages for the
  reader of the release notes.
- Preview without side effects: `pnpm release --dry-run`. Force a specific
  bump: `pnpm release minor` (or `major`, `patch`, an exact version).
- `.release-it.json` guards the flow: `git.requireBranch` refuses to release
  off `__PROD_BRANCH__`, and a dirty working tree aborts the run.
- The GitLab Release itself is created by CI from the pushed tag
  (`gitlab.release` is `false` in `.release-it.json`), so no local
  `GITLAB_TOKEN` is needed.
- Tag pipelines skip the test jobs: CI already validated the release commit
  on `__PROD_BRANCH__`; the tag pipeline only publishes the release.
- The changelog body is English-only by design — it is generated from
  commit messages. The `/changelog` page chrome is localized.
- Renovate: `renovate.json` is platform-neutral — enable the
  [Renovate app for GitLab](https://docs.renovatebot.com/modules/platform/gitlab/)
  (hosted app or self-hosted runner) and it works unchanged.
