---
paths:
  - "packages/ui/**"
---

# @repo/ui — Radix UI primitives (this scaffold's variant)

- Components in `packages/ui/src/components` are shadcn/ui ports built on
  `@radix-ui/react-*` packages. Composition uses the `asChild` prop to
  merge behavior into a custom child element.
- When adding a component, prefer generating the shadcn/ui Radix variant
  (`components.json` is configured for it) and adjust to house style —
  don't hand-roll primitives that Radix already provides (focus management,
  aria wiring, portal/overlay behavior).
- Keep component APIs presentational: data fetching, i18n strings, and
  routing stay in `apps/web`; `@repo/ui` receives them as props/children.
