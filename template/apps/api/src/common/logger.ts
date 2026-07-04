import path from "node:path";
import type { Params } from "nestjs-pino";
import { env } from "../config/env";

function buildTransport(): {
  targets: Array<{
    target: string;
    options?: Record<string, unknown>;
    level?: string;
  }>;
} {
  const targets: Array<{
    target: string;
    options?: Record<string, unknown>;
    level?: string;
  }> = [];

  if (env.NODE_ENV === "development") {
    targets.push({
      target: "pino-pretty",
      options: { singleLine: true, translateTime: "HH:MM:ss" },
    });
  } else {
    // JSON to stdout — the 12-factor default; ship/rotate at the platform.
    targets.push({ target: "pino/file", options: { destination: 1 } });
  }

  if (env.LOG_FILE_ENABLED) {
    // Daily-rotated files for VM deployments without a log collector.
    targets.push({
      target: "pino-roll",
      options: {
        file: path.join(env.LOG_DIR, "api"),
        extension: ".log",
        frequency: "daily",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        limit: { count: 14 },
      },
    });
  }

  return { targets };
}

export const loggerOptions: Params = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    // The request-context middleware assigns req.id before pino runs.
    genReqId: (req) => (req as { id?: string }).id ?? "unknown",
    customProps: (req) => ({ traceId: (req as { id?: string }).id }),
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },
    autoLogging: {
      ignore: (req) => req.url?.startsWith("/health") ?? false,
    },
    transport: buildTransport(),
  },
};
