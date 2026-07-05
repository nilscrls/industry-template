import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { organization } from "./organizations.js";

export const fileObject = pgTable(
  "file_object",
  {
    id: uuid().primaryKey().defaultRandom(),
    fileName: varchar({ length: 255 }).notNull(),
    contentType: varchar({ length: 255 }).notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    /** Object key in the S3 bucket — never exposed to clients directly. */
    storageKey: text().notNull().unique(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.organizationId), index().on(table.ownerId)]
);
