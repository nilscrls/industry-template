import "reflect-metadata";
import { Pool } from "pg";
import { DataSource } from "typeorm";
import { ENTITIES } from "./entities/index.js";
import { MIGRATIONS } from "./migrations/index.js";

export interface CreateDataSourceOptions {
  logging?: boolean;
  poolSize?: number;
}

/**
 * Builds an UN-initialized DataSource — the caller (`DbService`, tests,
 * `migrate.ts`) is responsible for `.initialize()`/`.destroy()`. Migrations
 * are an explicit class list (no glob): the same import graph works
 * whether the process runs from `src` (tsx) or `dist` (compiled), and a
 * missing migration is a compile error, not a silent no-op.
 */
export function createDataSource(
  url: string,
  opts: CreateDataSourceOptions = {}
): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: "typeorm_migrations",
    migrationsTransactionMode: "all",
    // pgcrypto backs gen_random_uuid() for every uuid PK default; TypeORM
    // would otherwise try to CREATE EXTENSION itself (installExtensions
    // below is false — the compose init script / a migration owns that).
    uuidExtension: "pgcrypto",
    installExtensions: false,
    poolSize: opts.poolSize ?? 20,
    connectTimeoutMS: 10_000,
    logging: opts.logging ?? false,
  });
}

/** For Better-Auth, which takes a raw `pg.Pool` (`database: pool`). */
export function createPool(url: string, opts: { max?: number } = {}): Pool {
  return new Pool({ connectionString: url, max: opts.max ?? 10 });
}
