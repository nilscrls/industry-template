# GDPR / RGPD compliance

What the template ships versus what YOU (the operator / data controller)
must do before production. The template gives you the machinery; it cannot
make you compliant by itself.

## Provided by the template

- **Legal pages** at `/legal/mentions`, `/legal/privacy`, `/legal/terms` —
  per-locale markdown in `apps/web/content/legal/`, rendered server-side,
  linked from the global footer.
- **Cookie consent** (`apps/web/src/components/consent.tsx`): PostHog loads
  opted-out (`instrumentation-client.ts`) and captures nothing — and writes
  no cookies — until the banner's explicit opt-in. Revocable anytime via
  the footer's "Cookie preferences". Session/locale/theme cookies are
  strictly necessary and not gated (but ARE listed in the privacy policy).
- **Data export (portability, art. 20)**: `GET /me/export`
  (`apps/api/src/privacy/`) — the authenticated user's account, memberships,
  projects, file metadata, the points wallet for the **active organization**
  (balance + the 20 most recent entries) and own audit entries as JSON;
  throttled 5/hour; audited. Surfaced in Settings →
  "Download my data".
- **Account deletion (erasure, art. 17)**: Better-Auth `deleteUser`,
  password-confirmed, from Settings. Blocked while the user is the sole
  owner of an organization (transfer or delete it first —
  `apps/api/src/auth/user-deletion.ts`). Rows cascade (including the points
  wallet: `wallet.userId` and `walletEntry.walletId` are `ON DELETE CASCADE`,
  `walletEntry.actorId` is `ON DELETE SET NULL`); uploaded blobs are deleted
  from S3; **audit entries are kept with `actorId` nulled** — anonymized
  accountability, not data retention (documented in the policy).
- **Audit trail** of every mutation (org-scoped, append-only) including
  `user.exportData` and `user.delete` events.

## Operator TODOs (before production)

1. Fill every `[bracketed]` field in `apps/web/content/legal/*.md`:
   publisher identity, SIREN, director of publication, host details (LCEN
   requires them), DPO/privacy contact, processors, retention periods.
2. Have the terms and privacy policy reviewed by a lawyer.
3. Sign DPAs with your actual processors (host, SMTP, Sentry, PostHog) and
   verify hosting regions / transfer mechanisms.
4. Maintain a record of processing activities (registre des traitements —
   GDPR art. 30).
5. Decide retention periods (audit log, server logs, backups) and enforce
   them (cron/cleanup jobs are not shipped).
6. Server-side PostHog (API analytics module) is not gated by the browser
   banner — it's your call whether product events server-side require
   consent in your context; if so, propagate the consent cookie to the API
   and gate `PosthogService` on it.
7. If you add marketing cookies or third-party embeds, extend the consent
   banner into per-category preferences.
