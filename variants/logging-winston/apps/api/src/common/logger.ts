import { trace } from "@opentelemetry/api";
import {
  utilities as nestWinstonModuleUtilities,
  type WinstonModuleOptions,
} from "nest-winston";
import { addColors, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type Transport from "winston-transport";
import { env } from "../config/env";

/**
 * Winston counterpart of the default pino setup: same LOG_LEVEL values,
 * same stdout-JSON default, same optional daily-rotated files (14 kept)
 * behind LOG_FILE_ENABLED, same single `traceId` correlation field.
 */

// pino's level names, so the strict LOG_LEVEL enum in config/env.ts is
// valid unchanged. `verbose` is included because Nest's LoggerService
// (via nest-winston) calls logger.verbose().
const LEVELS = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  verbose: 4,
  debug: 5,
  trace: 6,
} as const;

addColors({
  fatal: "magenta",
  error: "red",
  warn: "yellow",
  info: "green",
  verbose: "cyan",
  debug: "blue",
  trace: "gray",
});

const REDACTED_HEADERS = ["authorization", "cookie", "set-cookie"];

// pino redacted req/res header paths; winston has no redact option, so a
// format strips them defensively from anything that logs a req/res shape.
const redactHeaders = format((info) => {
  for (const key of ["req", "res"] as const) {
    const headers = (
      info[key] as { headers?: Record<string, unknown> } | undefined
    )?.headers;
    if (headers) {
      for (const header of REDACTED_HEADERS) {
        delete headers[header];
      }
    }
  }
  return info;
});

// Errors don't JSON.stringify; flatten the conventional `err` meta key.
const serializeError = format((info) => {
  if (info.err instanceof Error) {
    info.err = {
      name: info.err.name,
      message: info.err.message,
      stack: info.err.stack,
    };
  }
  return info;
});

// ONE correlation field: the OTel trace id when tracing is active — same
// contract as the pino variant (exception filter falls back to req.id).
const withTraceId = format((info) => {
  info.traceId ??= trace.getActiveSpan()?.spanContext().traceId;
  return info;
});

function buildTransports(): Transport[] {
  // Winston has no worker threads (pino's vitest crash doesn't apply), but
  // tests still want quiet output: a bare console transport honoring
  // LOG_LEVEL (the integration suite sets `warn`) is all they need.
  if (env.NODE_ENV === "test") {
    return [new transports.Console({ format: format.json() })];
  }

  const list: Transport[] = [];
  if (env.NODE_ENV === "development") {
    list.push(
      new transports.Console({
        format: format.combine(
          format.timestamp({ format: "HH:mm:ss" }),
          nestWinstonModuleUtilities.format.nestLike("api", {
            colors: true,
            prettyPrint: true,
          })
        ),
      })
    );
  } else {
    // JSON to stdout — the 12-factor default; ship/rotate at the platform.
    list.push(new transports.Console({ format: format.json() }));
  }

  if (env.LOG_FILE_ENABLED) {
    // Daily-rotated files for VM deployments without a log collector.
    // Mirrors the pino-roll defaults: daily files under LOG_DIR, 14 kept.
    list.push(
      new DailyRotateFile({
        dirname: env.LOG_DIR,
        filename: "api-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxFiles: "14d",
        format: format.json(),
      })
    );
  }
  return list;
}

export const loggerOptions: WinstonModuleOptions = {
  levels: LEVELS,
  level: env.LOG_LEVEL,
  format: format.combine(
    redactHeaders(),
    serializeError(),
    withTraceId(),
    format.timestamp()
  ),
  transports: buildTransports(),
};
