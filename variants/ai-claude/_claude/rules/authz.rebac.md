---
paths:
  - "packages/contracts/src/permissions.ts"
  - "packages/auth/**"
  - "apps/api/src/auth/**"
  - "packages/db/src/schema/permissions.ts"
---

# Authorization — ReBAC (this scaffold's model)

- Global roles are only `admin` (bypasses relationship checks:
  `manage all`) and `member`. Real access comes from per-project
  memberships: `project_member` tuples with a relation of `owner`,
  `editor`, or `viewer` (`projectRelations`), mapped to actions by
  `relationActions` (`packages/contracts/src/permissions.ts`).
- `rulesFromMemberships` converts membership tuples into serializable CASL
  rules — one rule per (relation, action) with
  `conditions: { id: { $in: [...projectIds] } }`. `baselinePermissions`
  covers what every authenticated user can do regardless of memberships.
  The same rules flow to the web app via `GET /me/permissions`.
- **List/read endpoints carry no coarse `@RequireAbility`** — the service
  scopes queries by membership. A fresh user must get an empty list, not a
  403. Guard mutations with ability checks.
- The creator's `owner` membership is inserted **in the same transaction**
  as project creation — never as a follow-up write.
- A user's resolved rules are cached in Redis: **every membership write
  must invalidate that user's cached rules**, or they keep stale access.
- New entity (via `pnpm gen feature`): decide whether it is
  membership-scoped (extend the membership/relation model) or baseline
  (add to `baselinePermissions`). See `docs/authorization.md`.
