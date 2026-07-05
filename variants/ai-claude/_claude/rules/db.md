---
paths:
  - "packages/db/**"
  - "packages/contracts/**"
---

# @repo/db + @repo/contracts — data layer conventions

- Schema lives in `packages/db/src/schema`; migrations are generated, never
  hand-written: edit the schema, then `pnpm db:generate` (root) and commit
  the new files under `packages/db/drizzle/` — including `meta/_journal.json`.
- Apply with `pnpm db:migrate`; keep `pnpm db:seed` working after every
  schema change (seeds are part of the scaffold's first-run experience).
- Better-Auth owns its tables: regenerate them with `pnpm auth:schema`
  instead of editing the auth schema by hand.
- Contracts (`packages/contracts`) are the single source of truth for API
  shapes: oRPC contract + Zod schemas + CASL permission definitions. Change
  the contract first; the api implements it, the web consumes it.
- Zod schemas that parse query params use `z.coerce` — that is why server
  handlers must type inputs from schema **outputs** (see the api rules).
- These packages compile to CommonJS (no `"type": "module"`); scripts use
  `main().catch(...)`, never top-level await.
