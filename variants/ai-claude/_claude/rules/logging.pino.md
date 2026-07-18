---
paths:
  - "apps/api/**"
---

# Logging — pino (nestjs-pino)

- The pino logger must set no `transport` when `NODE_ENV === "test"` —
  transports spawn worker threads that crash vitest's forked workers.
- Request logging is pino-http autoLogging (configured in
  `src/common/logger.ts`): don't add a second request logger. Redaction of
  authorization/cookie/set-cookie and the `/health` ignore live there too.
- Inject `PinoLogger` and call `setContext(...)` in the constructor —
  `common/exception.filter.ts` and `mail/mail.processor.ts` are the pattern.
- One correlation field: `traceId` (OTel trace id, falling back to the
  request id). Never log a second identifier next to it.
