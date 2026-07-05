import { init } from "@sentry/node";
import { env } from "./config/env";

/**
 * Sentry covers exception capture only — tracing belongs to the OTel setup
 * in tracing.ts, so Sentry's own OpenTelemetry bootstrap is skipped to avoid
 * two competing tracer providers. Never active under NODE_ENV=test (network
 * + background flushing inside vitest workers). When disabled, the SDK stays
 * uninitialized and `captureException` is a no-op.
 */
if (env.SENTRY_ENABLED && env.NODE_ENV !== "test") {
  init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
  });
}
