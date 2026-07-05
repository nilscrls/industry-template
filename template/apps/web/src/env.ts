import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// No defaults on purpose: a missing variable must fail fast, so every value
// the app uses is declared explicitly in .env.
export const env = createEnv({
  server: {
    /** Internal URL of the NestJS api (SSR, rewrites). Inside docker: http://api:3001 */
    API_URL: z.url(),
  },
  client: {
    /** What the browser calls — the same-origin /api rewrite by default. */
    NEXT_PUBLIC_API_URL: z.string().min(1),

    /** Sentry exception capture in the browser. */
    NEXT_PUBLIC_SENTRY_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1),

    /** PostHog: analytics + exception autocapture in the browser. */
    NEXT_PUBLIC_POSTHOG_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST: z.url(),
  },
  runtimeEnv: {
    API_URL: process.env.API_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_ENABLED: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
