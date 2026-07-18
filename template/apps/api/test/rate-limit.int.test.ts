import path from "node:path";
import { createDb } from "@repo/db";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Dedicated suite for the Better-Auth rate limiter on the /auth/* express
 * mount (which bypasses the Nest ThrottlerGuard — see app.setup.ts).
 *
 * Separate file on purpose: env.ts reads process.env once per process and
 * the main suite runs with AUTH_RATE_LIMIT_ENABLED=false so its rapid
 * sign-ups don't trip the limiter. vitest.integration.config.ts runs files
 * sequentially (fileParallelism: false), so the container cost is serial.
 *
 * No OpenFGA container: nothing here reaches authorization (failed
 * sign-ins stop inside Better-Auth) and the FGA client only dials on use.
 */
let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let app: Awaited<ReturnType<typeof import("../src/app.setup.js")["createApp"]>>;
let server: Parameters<typeof request>[0];

// vitest runs with cwd = apps/api
const MIGRATIONS = path.resolve(process.cwd(), "../../packages/db/drizzle");

beforeAll(async () => {
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:17-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  // Same env contract as api.int.test.ts (env.ts has no defaults), except:
  // the limiter is ON and FGA points at a closed port (never dialed).
  const ownerUrl = postgres.getConnectionUri();
  const roleUrl = (role: string) => {
    const url = new URL(ownerUrl);
    url.username = role;
    url.password = role;
    return url.toString();
  };
  process.env.NODE_ENV = "test";
  process.env.API_PORT = "3001";
  process.env.DATABASE_URL_MIGRATIONS = ownerUrl;
  process.env.DATABASE_URL = roleUrl("app_user");
  process.env.DATABASE_URL_AUTH = roleUrl("app_auth");
  process.env.REDIS_URL = redis.getConnectionUrl();
  process.env.FGA_API_URL = "http://127.0.0.1:1";
  process.env.FGA_STORE_ID = "unused";
  process.env.FGA_API_TOKEN = "test-token";
  process.env.FGA_MODEL_ID = "";
  process.env.BETTER_AUTH_SECRET = "integration-test-secret-0123456789abcdef";
  process.env.AUTH_RATE_LIMIT_ENABLED = "true";
  process.env.REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.EMAILS_ENABLED = "true";
  process.env.MICROSOFT_CLIENT_ID = "test-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
  process.env.MICROSOFT_TENANT_ID = "common";
  process.env.WEB_URL = "http://localhost:3000";
  process.env.S3_ENDPOINT = "http://localhost:9000";
  process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY = "minioadmin";
  process.env.S3_SECRET_KEY = "minioadmin";
  process.env.S3_BUCKET = "uploads";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "1025";
  process.env.SMTP_SECURE = "false";
  process.env.MAIL_FROM = "Test <test@example.com>";
  process.env.OTEL_ENABLED = "false";
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
  process.env.OTEL_SERVICE_NAME = "api";
  process.env.SENTRY_ENABLED = "false";
  process.env.SENTRY_DSN = "test-dsn";
  process.env.POSTHOG_ENABLED = "false";
  process.env.POSTHOG_API_KEY = "test-key";
  process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
  process.env.LOG_LEVEL = "warn";
  process.env.LOG_FILE_ENABLED = "false";
  process.env.LOG_DIR = "./logs";

  const { pool, db } = createDb(ownerUrl);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await pool.query("ALTER ROLE app_user LOGIN PASSWORD 'app_user'");
  await pool.query("ALTER ROLE app_auth LOGIN PASSWORD 'app_auth'");
  await pool.end();

  const { createApp } = await import("../src/app.setup.js");
  app = await createApp();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await Promise.all([postgres?.stop(), redis?.stop()]);
});

describe("better-auth rate limiting on the /auth mount", () => {
  it("returns 429 with a retry hint after 10 rapid sign-in attempts", async () => {
    // /sign-in/email is pinned to 10 per 60s (packages/auth/src/auth.ts).
    // Under NODE_ENV=test better-auth buckets every request into a single
    // localhost fallback IP — exactly what a brute-force burst looks like.
    for (let i = 0; i < 10; i++) {
      const allowed = await request(server)
        .post("/auth/sign-in/email")
        .send({ email: "nobody@example.com", password: "wrong-password" });
      expect(allowed.status).toBe(401);
    }
    const limited = await request(server)
      .post("/auth/sign-in/email")
      .send({ email: "nobody@example.com", password: "wrong-password" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["x-retry-after"])).toBeGreaterThan(0);
  });

  it("buckets per path: other auth routes still answer once sign-in is limited", async () => {
    const session = await request(server).get("/auth/get-session");
    expect(session.status).toBe(200);
  });

  it("counts atomically under a concurrent burst (no lost updates)", async () => {
    // /sign-up/email allows 10 per 60s. Fire 15 at once: with the Redis
    // INCR-backed consume exactly 5 are rejected; the legacy
    // read-then-write fallback would let stragglers through.
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request(server)
          .post("/auth/sign-up/email")
          .send({
            name: `Burst ${i}`,
            email: `burst-${i}@example.com`,
            password: "Password123!",
          })
      )
    );
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
  });
});
