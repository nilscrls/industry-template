import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { env } from "./config/env";

/**
 * Side-effect module — main.ts imports it BEFORE any other application
 * import so the instrumentations patch http/express/pg/ioredis/bullmq before
 * those modules load. Never active under NODE_ENV=test: the SDK starts
 * exporters and background timers that have no place inside vitest workers
 * (same rule as the logger's transport).
 *
 * The OTLP exporter reads OTEL_EXPORTER_OTLP_ENDPOINT itself (validated in
 * env.ts) — point it at any collector; no vendor is hardcoded.
 */
if (env.OTEL_ENABLED && env.NODE_ENV !== "test") {
  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // High-noise, low-signal for a typical API.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
      // TypeORM is covered by the pg instrumentation; BullMQ needs its own.
      new BullMQInstrumentation(),
    ],
  });
  sdk.start();
  process.on("SIGTERM", () => {
    sdk.shutdown().catch(() => undefined);
  });
}
