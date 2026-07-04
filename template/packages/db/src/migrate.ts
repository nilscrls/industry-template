import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

/**
 * Programmatic migrator: needs only runtime deps, so the same compiled file
 * runs locally (`pnpm db:migrate`) and as the compose `migrate` service.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  // biome-ignore lint/correctness/noGlobalDirnameFilename: this package compiles to CJS, where __dirname is correct
  const migrationsFolder = path.join(__dirname, "..", "drizzle");

  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
