import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

/**
 * Used only by `pnpm auth:schema` (@better-auth/cli generate) to regenerate
 * the drizzle schema for Better-Auth tables after enabling new plugins.
 * Diff the output against packages/db/src/schema/auth.ts. Never imported at runtime.
 */
export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
});
