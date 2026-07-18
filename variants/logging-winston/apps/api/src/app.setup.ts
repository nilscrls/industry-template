import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Auth } from "@repo/auth";
import { toNodeHandler } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import {
  WINSTON_MODULE_NEST_PROVIDER,
  WINSTON_MODULE_PROVIDER,
} from "nest-winston";
import type { Logger as WinstonLogger } from "winston";
import { AppModule } from "./app.module";
import { AUTH } from "./auth/auth.module";
import { originCheckMiddleware } from "./common/origin-check.middleware";
import { requestContextMiddleware } from "./common/request-context.middleware";
import { createRequestLoggerMiddleware } from "./common/request-logger.middleware";
import { env } from "./config/env";

/**
 * Shared by main.ts and the integration tests so both run the exact same
 * middleware stack.
 *
 * MIRRORED FILE: this is the winston copy of template/apps/api/src/app.setup.ts
 * — it differs only by the logger lines (nest-winston providers + the request
 * logger middleware that replaces pino-http). Any change to the template file
 * MUST be replayed here (overlays copy whole files).
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Raw bodies stay untouched: Better-Auth and oRPC both parse themselves.
    bodyParser: false,
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.flushLogs();

  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  // First in the stack: request id + AsyncLocalStorage scope.
  express.use(requestContextMiddleware);

  // The API serves JSON only (docs are a bare openapi.json), so the CSP can
  // be maximally strict: nothing loads, nothing frames us.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // Meaningful behind TLS only; harmless over plain http in dev.
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  // Authenticated JSON by default: a shared cache (CDN, proxy) must never
  // store a response — a cached response served to the wrong user is an
  // IDOR. Public endpoints opt out explicitly with @Header("Cache-Control").
  // Express-level (not a Nest interceptor) so the Better-Auth handler
  // mounted below is covered too.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  // CSRF: SameSite=Lax cookies + Better-Auth trustedOrigins already cover
  // most vectors; this rejects any cross-origin write that slips through.
  app.use(originCheckMiddleware);
  // Same-origin via the Next.js rewrite makes CORS mostly moot; this covers
  // direct-to-API setups (mobile clients, split domains).
  app.enableCors({ origin: env.WEB_URL, credentials: true });
  app.enableShutdownHooks();

  // Better-Auth must mount BEFORE app.init(): Nest registers a catch-all 404
  // there, so anything added later never sees a request. The DI container is
  // already instantiated at create-time, so app.get() is safe here.
  const auth = app.get<Auth>(AUTH);
  const authHandler = toNodeHandler(auth);
  express.all("/auth/*splat", (req, res) => {
    // Better-Auth matches against its public base (<WEB_URL>/api/auth), but
    // the /api prefix is stripped by the Next rewrite / reverse proxy before
    // the request reaches us — restore it so the router matches.
    req.url = `/api${req.url}`;
    return authHandler(req, res);
  });

  // Request access-logging (winston has no pino-http): registered after the
  // Better-Auth mount and before app.init(), so /auth requests are handled
  // first (never logged — their URLs can carry one-time tokens) while every
  // Nest route, registered at init, is.
  express.use(
    createRequestLoggerMiddleware(
      app.get<WinstonLogger>(WINSTON_MODULE_PROVIDER)
    )
  );

  await app.init();

  return app;
}
