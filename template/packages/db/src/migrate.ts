import "reflect-metadata";
import { createDataSource } from "./data-source.js";

/**
 * Programmatic migrator: needs only runtime deps, so the same compiled file
 * runs locally (`pnpm db:migrate`) and as the compose `migrate` service.
 * Works under tsx (from `src`) too, because migrations are explicit
 * imports (see `migrations/index.ts`), not a glob.
 */
async function main(): Promise<void> {
  // Migrations run as the owner (bypasses RLS); the runtime DATABASE_URL is
  // the restricted app_user role and cannot ALTER tables.
  const connectionString =
    process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL_MIGRATIONS (or DATABASE_URL) is not set");
    process.exit(1);
    return;
  }

  const dataSource = createDataSource(connectionString);
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: "all" });
    console.log(`${applied.length} migration(s) applied`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
