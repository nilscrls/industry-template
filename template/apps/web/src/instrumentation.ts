import { captureRequestError, init } from "@sentry/nextjs";
import { env } from "@/env";

/**
 * Server-side Sentry for the Next.js runtime (SSR/route errors). Dormant
 * unless enabled, and never under NODE_ENV=test.
 */
export function register(): void {
  if (
    env.NEXT_PUBLIC_SENTRY_ENABLED &&
    process.env.NODE_ENV !== "test" &&
    process.env.NEXT_RUNTIME === "nodejs"
  ) {
    init({
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError = captureRequestError;
