import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

/**
 * Programmatic migrator: needs only runtime deps, so the same compiled file
 * runs locally (`pnpm db:migrate`) and as the compose `migrate` service.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

const { db, pool } = createDb(connectionString);
try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
