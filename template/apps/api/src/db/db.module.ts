import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createDb, type Database } from "@repo/db";
import { env } from "../config/env";

@Injectable()
export class DbService implements OnApplicationShutdown {
  readonly db: Database;
  private readonly pool: ReturnType<typeof createDb>["pool"];

  constructor() {
    const { db, pool } = createDb(env.DATABASE_URL);
    this.db = db;
    this.pool = pool;
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  onApplicationShutdown(): Promise<void> {
    return this.pool.end();
  }
}

@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
