---
name: scaffold-feature
description: Scaffold a complete vertical slice for a new entity (oRPC contract, Drizzle table, NestJS module with TDD test skeletons, Next.js page) using the repo's turbo generator. Use whenever adding a new domain entity or CRUD feature — never hand-write the module wiring.
---

# Scaffold a new feature

The repo ships a turbo generator that creates and registers every layer of a
new entity consistently. Always start from it:

```sh
pnpm gen feature
```

It prompts for the entity name (singular, kebab-case, e.g. `invoice`) and its
plural, then:

- adds `packages/contracts/src/<plural>.ts` (list query includes `search` +
  `sortBy` with typed sort-field literals) and registers it in the contract
  router, index exports, the contracts `resources` list, and appends a
  `type` block to `packages/fga/model.fga`;
- adds `packages/db/src/schema/<plural>.ts` and registers it in the schema
  index;
- adds `apps/api/src/<plural>/` (service with a sort-column map, controller,
  module), registers the module in `app.module.ts`, and creates
  `apps/api/test/<plural>.int.test.ts` — TDD skeletons that start as todos;
- adds `apps/web/src/app/(app)/<plural>/` — a server-driven TanStack Table +
  nuqs page (`page.tsx`), its URL parsers (`search-params.ts`) and their unit
  test;
- inserts the entity's i18n namespace AND its `shell.nav` label into
  `packages/i18n/messages/en.json` and `fr.json`, and adds the nav item to
  `apps/web/src/components/app-shell.tsx` (it fails loudly if an anchor
  drifted — do not re-add these by hand).

Non-interactive: `pnpm gen feature --args <name> <plural>`.

## After generating

1. `pnpm lint:fix` — normalize the generated import order.
2. `pnpm db:generate && pnpm db:migrate` — create and apply the migration.
3. Review the generated `type` block in `packages/fga/model.fga`, then run
   `pnpm fga:bootstrap` (see `docs/authorization.md`).
4. Review the inserted i18n copy in `en.json`/`fr.json` (entity words are
   placeholders) and swap the nav icon in `app-shell.tsx` (the generator
   reuses the projects icon).
5. Make the generated integration tests pass (`pnpm test:integration`) —
   they are the feature's TDD checklist.

Do not bypass the generator and hand-copy an existing module: the `modify`
actions above register the feature in nine places (contract router, contract
index, resources, model.fga, schema index, app.module, both message catalogs
and the nav), and missing one produces runtime DI, contract-router or i18n
failures, not compile errors.
