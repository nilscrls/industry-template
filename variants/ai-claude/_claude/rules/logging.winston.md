---
paths:
  - "apps/api/**"
---

# Logging — winston (nest-winston)

- Request logging is `src/common/request-logger.middleware.ts`, registered
  in `app.setup.ts` AFTER the Better-Auth mount (auth URLs can carry
  one-time tokens — they must never be access-logged) and before
  `app.init()`. Don't move it, and don't add express-winston.
- It logs no headers at all — that IS the redaction strategy. If you log a
  `req`/`res` shape elsewhere, the `redactHeaders` format in
  `common/logger.ts` strips authorization/cookie/set-cookie defensively.
- Inject the winston `Logger` via `@Inject(WINSTON_MODULE_PROVIDER)` and
  derive `logger.child({ context: ClassName.name })` in the constructor —
  `common/exception.filter.ts` and `mail/mail.processor.ts` are the pattern.
- Custom levels mirror pino (`fatal…trace` + `verbose`), so `LOG_LEVEL`
  values in `.env` are unchanged. Under `NODE_ENV=test` the logger collapses
  to one console transport; keep tests quiet with `LOG_LEVEL=warn`.
- One correlation field: `traceId` (OTel trace id, falling back to the
  request id). Never log a second identifier next to it.
- `app.setup.ts` / `app.module.ts` here are mirror copies of the template's
  pino versions — see the MIRRORED FILE headers before restructuring.
