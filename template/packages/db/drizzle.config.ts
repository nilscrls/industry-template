import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL_MIGRATIONS is not set — declare it in .env (run through `pnpm db:generate` / `pnpm db:migrate` at the repo root)"
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
  // app_user / app_auth are created by the grants migration / init script,
  // not managed by drizzle-kit (they are declared `.existing()`).
  entities: { roles: { exclude: ["app_user", "app_auth"] } },
});
