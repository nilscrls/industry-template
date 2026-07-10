import { defaultRolePermissions } from "@repo/contracts";
import { createDb } from "./client.js";
import { rolePermission } from "./schema/index.js";

/**
 * Baseline seed — safe to run in every environment (idempotent: resets the
 * role baseline to @repo/contracts). Dev fixtures live in @repo/auth
 * (`seed:dev`) because creating users requires Better-Auth's password hasher.
 */
async function main(): Promise<void> {
  // Seeds run as the owner (bypasses RLS) — they legitimately touch every
  // tenant's rows.
  const connectionString =
    process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL_MIGRATIONS (or DATABASE_URL) is not set");
    process.exit(1);
  }

  const { db, pool } = createDb(connectionString);
  try {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermission);
      const values = Object.entries(defaultRolePermissions).flatMap(
        ([role, rules]) =>
          rules.map((rule) => ({
            role,
            action: rule.action,
            subject: rule.subject,
            conditions: rule.conditions ?? null,
            inverted: rule.inverted ?? false,
          }))
      );
      await tx.insert(rolePermission).values(values);
    });
    console.log("Role permission baseline seeded");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
