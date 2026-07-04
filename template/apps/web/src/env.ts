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
  },
  runtimeEnv: {
    API_URL: process.env.API_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
