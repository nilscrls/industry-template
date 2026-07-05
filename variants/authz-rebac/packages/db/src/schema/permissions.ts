import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { project } from "./projects.js";

/**
 * ReBAC relationship tuples: who holds which relation to which project.
 * The relation decides the granted actions (see `relationActions` in
 * @repo/contracts). One row per (project, user); changing a relation is an
 * upsert on the composite key.
 */
export const projectMember = pgTable(
  "project_member",
  {
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    relation: text().$type<"owner" | "editor" | "viewer">().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index().on(table.userId),
  ]
);
