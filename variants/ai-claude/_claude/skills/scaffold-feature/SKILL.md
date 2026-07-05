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

- adds `packages/contracts/src/<plural>.ts` and registers it in the contract
  router, index exports, and the CASL `subjects` list;
- adds `packages/db/src/schema/<plural>.ts` and registers it in the schema
  index;
- adds `apps/api/src/<plural>/` (service, controller, module), registers the
  module in `app.module.ts`, and creates
  `apps/api/test/<plural>.int.test.ts` — TDD skeletons that start as todos;
- adds `apps/web/src/app/(app)/<plural>/page.tsx`.

Non-interactive: `pnpm gen feature --args <name> <plural>`.

## After generating

1. `pnpm db:generate && pnpm db:migrate` — create and apply the migration.
2. Grant permissions for the new CASL subject (see `docs/authorization.md`).
3. Add i18n keys under the entity's namespace in
   `packages/i18n/messages/en.json` AND `fr.json`.
4. Add a nav item in `apps/web/src/components/app-shell.tsx`.
5. Make the generated integration tests pass (`pnpm test:integration`) —
   they are the feature's TDD checklist.

Do not bypass the generator and hand-copy an existing module: the `modify`
actions above register the feature in five places, and missing one produces
runtime DI or contract-router failures, not compile errors.
