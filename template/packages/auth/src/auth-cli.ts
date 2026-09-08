import { betterAuth } from "better-auth";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

/**
 * Used only by `pnpm auth:schema` (@better-auth/cli generate) to introspect
 * a LIVE database and emit the DDL Better-Auth's tables are still missing
 * (start compose, run `pnpm db:migrate`, then `pnpm auth:schema`). Paste the
 * output into a new TypeORM migration and mirror it as entity columns —
 * empty output means no drift. Never imported at runtime.
 */
export const auth = betterAuth({
  database: new Pool({
    connectionString:
      process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL,
  }),
  emailAndPassword: { enabled: true },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    organization(),
    twoFactor(),
  ],
});
