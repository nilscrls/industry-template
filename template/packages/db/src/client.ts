import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): {
  db: Database;
  pool: Pool;
} {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool };
}
