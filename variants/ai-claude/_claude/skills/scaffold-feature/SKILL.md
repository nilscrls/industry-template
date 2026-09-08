---
name: scaffold-feature
description: Scaffold a complete vertical slice for a new entity (oRPC contract, TypeORM entity + migration stub, NestJS module with TDD test skeletons, Next.js page) using the repo's turbo generator. Use whenever adding a new domain entity or CRUD feature — never hand-write the module wiring.
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
- adds `packages/db/src/entities/<name>.ts` (a TypeORM entity, singular
  kebab-case) and
  registers it in `packages/db/src/entities/index.ts`; adds a hand-written
  migration stub (`packages/db/src/migrations/<timestamp>-Add<Plural>.ts`,
  its class name ending in the same 13-digit timestamp TypeORM orders by)
  and registers it in `packages/db/src/migrations/index.ts`;
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
2. Review the generated migration stub (it's a plain `CREATE TABLE`, not a
   diff), then `pnpm db:migrate`.
3. Review the generated `type` block in `packages/fga/model.fga`, then run
   `pnpm fga:bootstrap` (see `docs/authorization.md`).
4. Review the inserted i18n copy in `en.json`/`fr.json` (entity words are
   placeholders) and swap the nav icon in `app-shell.tsx` (the generator
   reuses the projects icon).
5. Make the generated integration tests pass (`pnpm test:integration`) —
   they are the feature's TDD checklist.

Do not bypass the generator and hand-copy an existing module: the `modify`
actions above register the feature in ten places (contract router, contract
index, resources, model.fga, the entities index, the migrations index,
app.module, both message catalogs and the nav), and missing one produces
runtime DI, contract-router or i18n failures, not compile errors.
