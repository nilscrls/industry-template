import { projectStatuses } from "@repo/contracts";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { organization } from "./organizations.js";

export const projectStatusEnum = pgEnum("project_status", projectStatuses);

export const project = pgTable(
  "project",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    status: projectStatusEnum().notNull().default("draft"),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index().on(table.organizationId),
    index().on(table.ownerId),
    index().on(table.status),
    index().on(table.createdAt),
  ]
);
