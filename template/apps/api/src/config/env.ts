import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().default(3001),
    /** Public origin of the web app — trusted origin + base for auth URLs. */
    WEB_URL: z.url(),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),

    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: z.url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(1),

    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    LOG_FILE_ENABLED: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    LOG_DIR: z.string().default("./logs"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
