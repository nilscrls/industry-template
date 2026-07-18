# Releases & changelog

Releases are driven by [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)
(conventional-commit changelog + version bump, run locally — no server-side
bot) plus a tag-triggered GitLab Release job in `.gitlab-ci.yml`. The
changelog is generated from conventional commit messages and rendered in the
app at `/changelog` (source of truth: `apps/web/content/changelog.md`; root
`CHANGELOG.md` is a pointer). `.versionrc.json` points the tool at that file.

## Release flow

The branching model itself is documented in `docs/git-flow.md`.

1. Features land on `develop` via `feature/*` merge requests (conventional
   commits).
2. To release, merge `develop` into `__PROD_BRANCH__` (directly or via a
   `release/*` branch).
3. On an up-to-date `__PROD_BRANCH__` checkout, run:

   ```sh
   npx commit-and-tag-version@12
   ```

   It bumps `package.json`, prepends the new entries to
   `apps/web/content/changelog.md`, commits `chore: release vX.Y.Z` and
   creates the `vX.Y.Z` tag.
4. Push branch and tag: `git push --follow-tags origin __PROD_BRANCH__`.
   The pipeline validates the branch push; the tag pipeline's `release` job
   publishes the GitLab Release.
5. **Back-merge `__PROD_BRANCH__` into `develop`** so the version bump and
   changelog don't regress on the next release.

## Hotfixes

1. Branch `hotfix/*` off `__PROD_BRANCH__`, commit with `fix:` (that's what
   drives the patch bump), MR into `__PROD_BRANCH__`.
2. Repeat steps 3–4 above for a patch release.
3. Back-merge `__PROD_BRANCH__` into `develop`.

## Notes

- Commit types drive the changelog: `feat:` → Features, `fix:` → Bug Fixes;
  `feat!:`/`BREAKING CHANGE:` bumps the major. Write commit messages for the
  reader of the release notes.
- Preview without side effects: `npx commit-and-tag-version@12 --dry-run`.
- The changelog body is English-only by design — it is generated from
  commit messages. The `/changelog` page chrome is localized.
- Tag pipelines skip the test jobs: CI already validated the release commit
  on `__PROD_BRANCH__`; the tag pipeline only publishes the release.
- Renovate: `renovate.json` is platform-neutral — enable the
  [Renovate app for GitLab](https://docs.renovatebot.com/modules/platform/gitlab/)
  (hosted app or self-hosted runner) and it works unchanged.
