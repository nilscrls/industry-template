import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import {
  createDataSource,
  createPool,
  type IsolationLevel,
  withTenant,
} from "@repo/db";
import type { Pool } from "pg";
import type { DataSource, EntityManager } from "typeorm";
import { requestContext } from "../common/request-context";
import { env } from "../config/env";

@Injectable()
export class DbService implements OnApplicationShutdown {
  /** Runtime DataSource (`app_user`) — subject to row-level security. */
  readonly dataSource: DataSource;
  /**
   * BYPASSRLS DataSource for Better-Auth lifecycle hooks ONLY
   * (user-deletion.ts): it reads `member` before a tenant context exists
   * (session creation) and owns the user-scoped auth tables. Never hand
   * this to feature services.
   */
  readonly authDataSource: DataSource;
  /**
   * BYPASSRLS pool handed straight to Better-Auth's own pg adapter
   * (`createAuth({ pool })`) — Better-Auth manages its own queries against
   * the auth tables, never through TypeORM.
   */
  readonly authPool: Pool;

  constructor() {
    // No I/O here — DataSource/Pool construction is synchronous; callers
    // must await init() before issuing any query (see DbModule below).
    // Connection budget per api instance: 20 (runtime, sized for the
    // concurrent-spend path in docs/database.md) + 5 (auth hooks: a handful
    // of queries per account deletion) + 10 (Better-Auth's own pool) = 35.
    this.dataSource = createDataSource(env.DATABASE_URL);
    this.authDataSource = createDataSource(env.DATABASE_URL_AUTH, {
      poolSize: 5,
    });
    this.authPool = createPool(env.DATABASE_URL_AUTH);
  }

  async init(): Promise<void> {
    await Promise.all([
      this.dataSource.initialize(),
      this.authDataSource.initialize(),
    ]);
  }

  /**
   * Run queries with the request's RLS context (SET LOCAL inside a
   * transaction). Every org-scoped read/write goes through this — services
   * KEEP their explicit organizationId filters; RLS is the net underneath,
   * not the primary filter.
   */
  tenant<T>(
    fn: (manager: EntityManager) => Promise<T>,
    opts?: { isolation?: IsolationLevel }
  ): Promise<T> {
    const store = requestContext.getStore();
    return withTenant(
      this.dataSource,
      {
        organizationId: store?.session?.session.activeOrganizationId ?? null,
        userId: store?.user?.id ?? null,
        isAdmin: store?.user?.role === "admin",
      },
      fn,
      opts
    );
  }

  async ping(): Promise<void> {
    await this.dataSource.query("SELECT 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.dataSource.destroy(),
      this.authDataSource.destroy(),
      this.authPool.end(),
    ]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DbService,
      // Async factory: every consumer (incl. AuthModule's AUTH useFactory)
      // receives an already-initialized DbService — Nest resolves this
      // provider's async useFactory before injecting it anywhere.
      useFactory: async (): Promise<DbService> => {
        const service = new DbService();
        await service.init();
        return service;
      },
    },
  ],
  exports: [DbService],
})
export class DbModule {}
