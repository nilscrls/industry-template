# Features

Where each capability lives and how to use it. Paths are relative to the
repo root.

## Authentication

Email + password with verification and reset emails, powered by Better-Auth.

- Config: `packages/auth/src/auth.ts` (factory), wired with env, Redis
  storage and the mail queue in `apps/api/src/auth/auth.module.ts`.
- Endpoints: `/api/auth/*` (sign-up, sign-in, sign-out, reset, verify…).
- Client: `authClient` in `apps/web/src/lib/auth-client.ts`
  (`signIn.email`, `signUp.email`, `signOut`, `useSession`).
- Pages: `apps/web/src/app/(auth)/login`, `(auth)/register`; route
  protection in `apps/web/src/middleware.ts` (cookie hint + redirect).
- Email verification is required in production
  (`requireEmailVerification: NODE_ENV === "production"`), relaxed in dev.
- Dev users after `pnpm db:seed` (password `Password123!`):
  `admin@example.com`, `manager@example.com`, `member@example.com`.

## Authorization — CASL

Serializable CASL rules enforced by the api and mirrored in the web UI. The
rule model (RBAC roles or ReBAC memberships) is chosen at scaffold time —
`docs/authorization.md` documents this project's setup end to end.

- Definitions: `packages/contracts/src/permissions.ts` (actions, subjects,
  rule sources).
- Enforcement (api): `@RequireAbility({ action, subject })` on controller
  methods; `ability.can(action, asSubject("Project", row))` in services for
  row-level checks.
- UI gating (web): `<Can action="update" subject={asSubject("Project", row)}>`
  and `useAbility()` from `apps/web/src/lib/ability.tsx` — built from the
  same rules the api enforces (`GET /me/permissions`).

## Multi-tenancy (organizations)

Better-Auth's `organization` plugin is the tenancy foundation: every
tenant-owned row (`project`, `file_object`, `audit_log`) carries an
`organization_id`, and every query is scoped to the session's active
organization.

- Tables: `packages/db/src/schema/organizations.ts`; the session stores
  `activeOrganizationId` (new sessions default to the user's first
  membership via a database hook in `packages/auth/src/auth.ts`).
- API scoping: `activeOrganizationId()` from
  `apps/api/src/common/request-context.ts` — users without an organization
  get **empty lists, never 403**; rows outside the active org are 404s.
- Org management (create, invite, switch) goes through Better-Auth's own
  `/api/auth/organization/*` endpoints; the web shell has an org switcher
  (`apps/web/src/components/org-switcher.tsx`).

## Two-factor authentication (TOTP)

Opt-in per user via Better-Auth's `twoFactor` plugin: enrollment (QR +
single-use backup codes) lives on `/settings`; sign-in redirects to
`/two-factor` when the account requires a second factor. Nothing else is
gated on it.

## SSO — Microsoft Entra ID

`socialProviders.microsoft` in `packages/auth/src/auth.ts`, configured by
`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`
(redirect URL: `<WEB_URL>/api/auth/callback/microsoft`). Adding another
OIDC provider later is a config addition, not a rewrite. The login page
shows "Sign in with Microsoft" next to email + password.

## Audit log

Append-only `audit_log` table (actor, organization, action, entity,
payload, `requestId` for log/trace correlation). ONE choke point writes it:
`AuditService.audited(...)` — an oRPC middleware attached to every mutating
procedure (`implement(...).use(audit.audited({ action, entityType }))`).
Admins browse it per tenant at `/admin/audit` (`GET /api/audit-logs`).

## Feature flags (PostHog + org overrides)

PostHog owns flag definitions and rollouts; the API layers per-organization
Redis overrides on top (`apps/api/src/flags/flags.service.ts`). Gate
features with `FlagsService.isEnabled("key")`; admins force flags per org
at `/admin/flags` (override wins over PostHog; writes are audited).

## Admin panel

`/admin` (route group `(admin)` in `apps/web`), gated by the existing
`admin` role — the API re-checks every endpoint via `@RequireAbility`.
Surfaces: organizations overview, audit log viewer, feature-flag overrides.

## End-to-end typed API

- Contract: `packages/contracts/src/*.ts`; router in `contract.ts`.
- Server: one controller method per procedure
  (`apps/api/src/projects/projects.controller.ts` is the reference).
- Client: `client.projects.create({...})` (typed promise) or
  `orpc.projects.list.queryOptions({ input })` for TanStack Query.
- OpenAPI 3.1: `GET /api/openapi.json` (public) — plug into Scalar/Postman
  or generate clients for non-TS consumers.

## Error codes with i18n

`{ code, params, traceId }` end to end — see `docs/architecture.md` for the
pipeline. To consume: `useApiErrorMessage()(error)` returns a localized
string; `useAppMutation` already toasts it. Translations live under
`errors.*` in `packages/i18n/messages/en.json` / `fr.json`.

## File upload / download (Minio, presigned)

- `POST /files/presign-upload` validates name/type/size (≤ 50 MB via
  `MAX_UPLOAD_SIZE_MB` in the contract), records metadata, returns a
  presigned **PUT** URL — the browser uploads straight to storage.
- `GET /files/:id/download-url` returns a presigned GET with
  `Content-Disposition: attachment`.
- Owner-scoped: members list/read/delete only their own files;
  managers/admins see all (`apps/api/src/files/files.service.ts`).
- Two S3 clients (`storage/storage.service.ts`): internal endpoint for
  server ops, `S3_PUBLIC_ENDPOINT` for URLs the browser must reach.

## Email + background jobs

- Templates: `packages/emails/src/templates/` (react-email);
  `pnpm --filter @repo/emails preview` for the live preview UI.
- Sending: better-auth hooks enqueue onto the BullMQ `mail` queue
  (`apps/api/src/mail/`) — 5 attempts, exponential backoff, so SMTP hiccups
  never fail a signup.
- Dev inbox: maildev at <http://localhost:1080>.
- New job types: add a queue in a module (`BullModule.registerQueue`), a
  `@Processor` worker, and enqueue from services — `mail/` is the pattern.

## Caching (Redis)

`CacheService` (`apps/api/src/redis/cache.service.ts`) is scope-first:
`forOrg(orgId)` / `forUser(userId)` / `global()` return a `ScopedCache`
(JSON `get/set/del/getOrSet`) whose keys carry the authorization scope —
unscoped keys (the cache-poisoning / cross-tenant IDOR vector) are
impossible. Used for dashboard stats (60 s, org-scoped, invalidated on
project writes) and permission rules (5 min, invalidated on role/override
changes). HTTP responses default to `Cache-Control: private, no-store`
(`app.setup.ts`). Redis also backs sessions, queues and rate limits. See
`docs/guides.md` for the rules.

## GDPR / privacy

Cookie-consent-gated analytics, public legal pages (en/fr, operator
placeholders), data export (`GET /me/export`), password-confirmed account
deletion with sole-owner protection and anonymized audit retention, global
footer with legal links. Details and the operator checklist:
`docs/compliance.md`.

## Changelog & releases

release-please maintains the version and `apps/web/content/changelog.md`
from conventional commits (workflow: `.github/workflows/release-please.yml`);
the app renders it at the public `/changelog` route
(`apps/web/src/app/(public)/changelog/page.tsx`, react-markdown, server-side).
Flow and hotfix back-merges: `docs/releases.md`.

## Logging & tracing

- nestjs-pino: pretty in dev, JSON on stdout otherwise; requests/responses
  auto-logged (health checks excluded), cookies/authorization redacted.
- File rotation for VM deploys: `LOG_FILE_ENABLED=true` writes daily-rotated
  files to `LOG_DIR` (14 kept) via pino-roll — stdout stays on either way.
- Every log line and every error payload carries the request's `traceId`,
  also echoed as the `x-request-id` response header (inbound header honored).
- OpenTelemetry (`OTEL_ENABLED=true`): auto-instruments HTTP, Express,
  Nest, pg (Drizzle), ioredis and BullMQ, exporting OTLP to
  `OTEL_EXPORTER_OTLP_ENDPOINT` — no vendor hardcoded
  (`apps/api/src/tracing.ts`). When tracing is on, pino's `traceId` IS the
  OTel trace id, so logs and spans correlate on one field.
  `docker compose --profile otel up` runs a local collector that prints
  spans (`otel-collector.yaml`).
- Sentry (`SENTRY_ENABLED`) and PostHog (`POSTHOG_ENABLED`) capture 5xx
  exceptions from the ONE error choke point
  (`apps/api/src/common/exception.filter.ts`); the web app mirrors this via
  `NEXT_PUBLIC_SENTRY_*` / `NEXT_PUBLIC_POSTHOG_*`
  (`apps/web/src/instrumentation-client.ts`). None of these SDKs activate
  under `NODE_ENV=test`.

## Hardening & operations

- **Postgres row-level security** on every org-scoped table: the API runs
  as the restricted `app_user` role and each request pins its tenant with
  `DbService.tenant(...)` — a forgotten WHERE clause returns zero foreign
  rows. Better-Auth uses the `app_auth` BYPASSRLS role; migrations/seeds
  the owner. See `docs/authorization.md`.
- `/health/live` and `/health/ready` (db + redis probes) — compose
  healthchecks and `depends_on` gate on them.
- Rate limiting: 300 req/min/IP default, Redis-backed
  (tune in `app.module.ts`, per-route with `@Throttle`).
- Strict security headers on both apps: the API ships a deny-all CSP, HSTS
  and `frame-ancestors 'none'` via helmet (`app.setup.ts`); the web app sets
  its baseline in `next.config.ts`.
- CSRF, layered without a token scheme: SameSite=Lax session cookies +
  Better-Auth `trustedOrigins` + an Origin check on every state-changing
  request (`apps/api/src/common/origin-check.middleware.ts`).
- Graceful shutdown hooks (pool/redis close), non-root Docker users.

## Frontend UX

| Feature | Where |
|---|---|
| Skeleton loading | `components/ui/skeleton.tsx`; dashboard + table show the pattern; route-level `app/loading.tsx` |
| Optimistic mutations | `useAppMutation({ optimistic: { queryKey, update } })` — snapshot, patch, rollback on error, invalidate on settle (project delete is the example) |
| Action feedback | same hook: localized error toasts always; `successMessage` key → success toast |
| Forms | RHF + `zodResolver` with schemas from `@repo/contracts` — `components/projects/project-form-dialog.tsx` is the reference (note: form schemas must not rely on `.default()`, supply defaults via `defaultValues`) |
| Tables | TanStack Table, server-driven pagination + filters + sorting, URL state via nuqs (`app/(app)/projects/page.tsx`, parsers in `search-params.ts`) |
| Charts | recharts themed with `--chart-*` tokens (`components/dashboard/charts.tsx`): 30-day area chart + status bar chart, tooltips, fixed status→color mapping |
| Dark mode | next-themes class strategy; toggle in the app shell; tokens defined for both schemes in `app/globals.css` |
| i18n | next-intl, cookie-based locale (en/fr), switcher in the shell; messages in `packages/i18n/messages/` |
| Error pages | `app/error.tsx` (with digest + retry), `not-found.tsx`, `global-error.tsx` (provider-free last resort) |
| Mobile-first | nav collapses into a menu below `sm`, cards/tables reflow, `Pixel 7` Playwright project keeps it honest |

## Vertical-slice generator

`pnpm gen feature` scaffolds and registers a new entity end to end:
contract + db schema + api module (with TDD `it.todo` integration specs) +
web page, then prints the manual checklist (migration, permissions, i18n
keys, nav). Templates: `turbo/generators/`.
