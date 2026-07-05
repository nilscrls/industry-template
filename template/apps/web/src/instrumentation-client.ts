import { captureRouterTransitionStart, init } from "@sentry/nextjs";
import posthog from "posthog-js";
import { env } from "@/env";

/**
 * Browser-side monitoring. Both SDKs stay dormant unless explicitly enabled
 * — and never run under NODE_ENV=test (vitest/happy-dom has no place for
 * network batching or session capture).
 */
const isTest = process.env.NODE_ENV === "test";

if (env.NEXT_PUBLIC_SENTRY_ENABLED && !isTest) {
  init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
  });
}

if (env.NEXT_PUBLIC_POSTHOG_ENABLED && !isTest) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    capture_exceptions: true,
  });
}

export const onRouterTransitionStart = captureRouterTransitionStart;
