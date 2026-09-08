import type { DataSource, EntityManager } from "typeorm";

export type IsolationLevel =
  | "READ UNCOMMITTED"
  | "READ COMMITTED"
  | "REPEATABLE READ"
  | "SERIALIZABLE";

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
 *
 * Never call `withTenant`/`.tenant()` again inside a `withTenant` callback:
 * a nested call opens a SECOND connection and a SECOND transaction, which
 * self-deadlocks the moment either transaction holds a row lock the other
 * needs. Pass the `EntityManager` down to helpers instead.
 */
export async function withTenant<T>(
  dataSource: DataSource,
  context: TenantContext,
  fn: (manager: EntityManager) => Promise<T>,
  opts: { isolation?: IsolationLevel } = {}
): Promise<T> {
  const run = async (manager: EntityManager): Promise<T> => {
    await manager.query(
      "select set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true), set_config('app.is_admin', $3, true)",
      [
        context.organizationId ?? "",
        context.userId ?? "",
        context.isAdmin ? "true" : "false",
      ]
    );
    return await fn(manager);
  };

  return opts.isolation
    ? await dataSource.transaction(opts.isolation, run)
    : await dataSource.transaction(run);
}
