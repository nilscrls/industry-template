import { sql } from "drizzle-orm";
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

export interface TenantContext {
  isAdmin?: boolean;
  organizationId: string | null;
  userId: string | null;
}

/**
 * Run `fn` in a transaction whose row-level-security context is pinned:
 * `set_config(..., true)` is SET LOCAL, so the settings die with the
 * transaction and can never leak onto another pooled connection. Null org
 * (fresh user) sets '' — every tenant policy then matches nothing, which is
 * the "sees nothing" contract. `isAdmin` unlocks the deliberate cross-tenant
 * policies (admin member counts), nothing else.
 */
export async function withTenant<T>(
  db: Database,
  context: TenantContext,
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_org_id', ${context.organizationId ?? ""}, true),
                 set_config('app.current_user_id', ${context.userId ?? ""}, true),
                 set_config('app.is_admin', ${context.isAdmin ? "true" : "false"}, true)`
    );
    return await fn(tx as unknown as Database);
  });
}
