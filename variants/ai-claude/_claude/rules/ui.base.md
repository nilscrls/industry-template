---
paths:
  - "packages/ui/**"
---

# @repo/ui — Base UI primitives (this scaffold's variant)

- Components in `packages/ui/src/components` are shadcn/ui ports built on
  `@base-ui/react`. **There is no `asChild`** — composition uses the
  `render` prop (`render={<Link …/>}`), and non-button renders on
  button-like primitives need `nativeButton={false}`.
- The Select wrapper statically collects `{ value, label }` items from its
  `SelectItem` children because Base UI's `Select.Value` does not render
  the selected item's text — keep that pattern when extending it.
- When adding a component, start from the shadcn/ui Base UI variant
  (`components.json` is configured for it) and adjust to house style —
  don't hand-roll primitives Base UI already provides (focus management,
  aria wiring, portal/overlay behavior).
- Keep component APIs presentational: data fetching, i18n strings, and
  routing stay in `apps/web`; `@repo/ui` receives them as props/children.
