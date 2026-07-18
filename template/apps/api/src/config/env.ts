import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// No defaults on purpose: a missing variable must fail fast, so every value
// the app uses is declared explicitly in .env. Sole exception: NODE_ENV is
// owned by the runtime and must never live in .env (see .env.example).
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int(),
    /** Public origin of the web app — trusted origin + base for auth URLs. */
    WEB_URL: z.url(),

    /** Runtime pool — the `app_user` role, subject to row-level security. */
    DATABASE_URL: z.string().min(1),
    /** Better-Auth pool — the `app_auth` BYPASSRLS role (auth tables only). */
    DATABASE_URL_AUTH: z.string().min(1),
    REDIS_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    /**
     * Better-Auth's built-in limiter on the /auth/* mount — the express
     * mount bypasses the Nest ThrottlerGuard, so this is the only rate
     * limit auth endpoints get. Rules live in packages/auth/src/auth.ts.
     */
    AUTH_RATE_LIMIT_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),

    /** OpenFGA — the authorization engine (hard runtime dependency). */
    FGA_API_URL: z.url(),
    FGA_STORE_ID: z.string().min(1),
    FGA_API_TOKEN: z.string().min(1),
    /** Pin a model id in production; empty string = latest model. */
    FGA_MODEL_ID: z.string().optional(),

    /** Microsoft Entra ID SSO (OIDC). */
    MICROSOFT_CLIENT_ID: z.string().min(1),
    MICROSOFT_CLIENT_SECRET: z.string().min(1),
    MICROSOFT_TENANT_ID: z.string().min(1),

    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int(),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(1),

    /** Sentry exception capture. */
    SENTRY_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    SENTRY_DSN: z.string().min(1),

    /** PostHog: product analytics, exception capture and feature flags. */
    POSTHOG_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    POSTHOG_API_KEY: z.string().min(1),
    POSTHOG_HOST: z.url(),

    /** OpenTelemetry (OTLP over HTTP; no vendor hardcoded). */
    OTEL_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url(),
    OTEL_SERVICE_NAME: z.string().min(1),

    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
    LOG_FILE_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    LOG_DIR: z.string().min(1),

    /**
     * Scaffold-time feature flags (create-industry-app stamps the chosen
     * values; operators can still flip them per environment).
     */
    /** Gate sign-in on a verified email address. */
    REQUIRE_EMAIL_VERIFICATION: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    /** Enqueue transactional emails. When false, sends are skipped (logged). */
    EMAILS_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
