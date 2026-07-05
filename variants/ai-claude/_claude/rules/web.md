---
paths:
  - "apps/web/**"
  - "packages/ui/**"
  - "packages/i18n/**"
---

# apps/web + @repo/ui + @repo/i18n — frontend conventions

- Next.js 16 App Router, standalone output. Server components by default;
  add `"use client"` only where interactivity requires it.
- **Every user-facing string goes through next-intl** — add the key to BOTH
  `packages/i18n/messages/en.json` and `fr.json` (both catalogs always
  ship). Message keys are typed via the `AppConfig` module augmentation in
  `@repo/i18n`; that file needs its `import type {} from "next-intl"` — do
  not remove it.
- `@repo/ui` and `@repo/i18n` are **source-exported ESM** packages (exports
  point at `.ts`/`.tsx` source, no build step, transpiled by Next). Relative
  imports inside them must be extensionless (`./config`, not `./config.js`)
  — Turbopack cannot resolve `.js`-suffixed imports to TS source. Never
  import either package from `apps/api`.
- UI components are owned shadcn/ui source in `packages/ui/src/components`.
  Extend components there, not with copies inside `apps/web`. Check for an
  existing component before adding one.
- Tailwind v4: web `globals.css` imports `@repo/ui/globals.css` and declares
  `@source` for the ui package (symlinked workspace packages aren't scanned
  by default). New class sources need an `@source` entry.
- Data fetching goes through the typed oRPC client + TanStack Query 5;
  tables use TanStack Table 8; URL state uses nuqs; forms use
  react-hook-form + the contract's Zod schema. Don't hand-roll fetch calls
  against the api.
- Toasts: sonner. Icons: lucide-react. Theming: next-themes — style both
  light and dark.
