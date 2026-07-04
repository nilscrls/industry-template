import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** Editable copy of the role baseline (seeded from @repo/contracts). */
export const rolePermission = pgTable(
  "role_permission",
  {
    id: uuid().primaryKey().defaultRandom(),
    role: text().notNull(),
    action: text().notNull(),
    subject: text().notNull(),
    conditions: jsonb().$type<Record<string, unknown> | null>(),
    inverted: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.role)]
);

/** Per-user grants and denies layered on top of the role. Deny wins. */
export const userPermissionOverride = pgTable(
  "user_permission_override",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text().notNull(),
    subject: text().notNull(),
    conditions: jsonb().$type<Record<string, unknown> | null>(),
    inverted: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)]
);
