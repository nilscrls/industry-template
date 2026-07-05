---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/e2e/**"
  - "**/vitest.config.*"
  - "**/playwright.config.*"
---

# Testing conventions

- Three layers, run from the repo root:
  - `pnpm test` — Vitest unit tests, colocated `*.test.ts(x)`.
  - `pnpm test:integration` — api integration suite against real Postgres +
    Redis via Testcontainers (Docker must be running). This is the layer
    that catches DI wiring, auth mounting, and HTTP serialization bugs that
    static checks and unit tests cannot.
  - `pnpm test:e2e` — Playwright against the web app.
- Prefer extending the integration suite over mocking for anything touching
  the database, auth, or the HTTP boundary; mock only true externals
  (mail, S3).
- The integration setup declares **every** server env var (strict env — no
  fallbacks). A new env var that isn't added there fails the suite at
  startup, by design.
- Test docs: `docs/testing.md` covers the layout, helpers and how to run a
  single test file.
