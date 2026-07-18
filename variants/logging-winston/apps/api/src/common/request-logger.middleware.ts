import { trace } from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "winston";

/**
 * Replacement for pino-http's autoLogging: one `info` line per completed
 * request with the same fields — the request id assigned by the
 * request-context middleware, the OTel traceId correlation field, no
 * headers (so nothing sensitive is ever logged) — and the same /health
 * ignore. Registered in app.setup.ts AFTER the Better-Auth mount, so auth
 * requests (whose URLs can carry one-time tokens) are never access-logged,
 * exactly like the pino variant where pino-http attaches at app.init().
 */
export function createRequestLoggerMiddleware(logger: Logger) {
  return function requestLoggerMiddleware(
    req: Request & { id?: string },
    res: Response,
    next: NextFunction
  ): void {
    if (req.url?.startsWith("/health")) {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    const traceId =
      trace.getActiveSpan()?.spanContext().traceId ?? req.id ?? "unknown";
    res.on("finish", () => {
      logger.info("request completed", {
        req: { id: req.id ?? "unknown", method: req.method, url: req.url },
        res: { statusCode: res.statusCode },
        responseTime: Number(process.hrtime.bigint() - start) / 1e6,
        traceId,
      });
    });
    next();
  };
}
