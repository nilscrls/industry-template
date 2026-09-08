import "reflect-metadata";
import { createDataSource } from "./data-source.js";

// Consumed by the TypeORM CLI (`migration:generate` / `migration:show`),
// never imported at runtime. Same owner connection as migrate.ts.
export default createDataSource(
  process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL ?? ""
);
