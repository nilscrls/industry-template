import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createDb, type Database, withTenant } from "@repo/db";
import { requestContext } from "../common/request-context";
import { env } from "../config/env";

@Injectable()
export class DbService implements OnApplicationShutdown {
  /** Runtime pool (`app_user`) — subject to row-level security. */
  readonly db: Database;
  /**
   * BYPASSRLS pool for Better-Auth ONLY: it reads `member` before a tenant
   * context exists (session creation) and owns the user-scoped auth tables.
   * Never hand this to feature services.
   */
  readonly authDb: Database;
  private readonly pool: ReturnType<typeof createDb>["pool"];
  private readonly authPool: ReturnType<typeof createDb>["pool"];

  constructor() {
    const runtime = createDb(env.DATABASE_URL);
    this.db = runtime.db;
    this.pool = runtime.pool;
    const auth = createDb(env.DATABASE_URL_AUTH);
    this.authDb = auth.db;
    this.authPool = auth.pool;
  }

  /**
   * Run queries with the request's RLS context (SET LOCAL inside a
   * transaction). Every org-scoped read/write goes through this — services
   * KEEP their explicit organizationId filters; RLS is the net underneath,
   * not the primary filter.
   */
  tenant<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    const store = requestContext.getStore();
    return withTenant(
      this.db,
      {
        organizationId: store?.session?.session.activeOrganizationId ?? null,
        userId: store?.user?.id ?? null,
        isAdmin: store?.user?.role === "admin",
      },
      fn
    );
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.pool.end(), this.authPool.end()]);
  }
}

@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
