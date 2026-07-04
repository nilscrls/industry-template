import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
    /** Internal URL of the NestJS api (SSR, rewrites). Inside docker: http://api:3001 */
    API_URL: z.url().default("http://localhost:3001"),
  },
  client: {
    /** What the browser calls — the same-origin /api rewrite by default. */
    NEXT_PUBLIC_API_URL: z.string().default("/api"),
  },
  runtimeEnv: {
    API_URL: process.env.API_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
