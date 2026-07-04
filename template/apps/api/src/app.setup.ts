import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Auth } from "@repo/auth";
import { toNodeHandler } from "better-auth/node";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AUTH } from "./auth/auth.module";
import { requestContextMiddleware } from "./common/request-context.middleware";
import { env } from "./config/env";

/**
 * Shared by main.ts and the integration tests so both run the exact same
 * middleware stack.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Raw bodies stay untouched: Better-Auth and oRPC both parse themselves.
    bodyParser: false,
  });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  // First in the stack: request id + AsyncLocalStorage scope.
  express.use(requestContextMiddleware);

  app.use(helmet());
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

  await app.init();

  return app;
}
