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

export const fileObject = pgTable(
  "file_object",
  {
    id: uuid().primaryKey().defaultRandom(),
    fileName: varchar({ length: 255 }).notNull(),
    contentType: varchar({ length: 255 }).notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    /** Object key in the S3 bucket — never exposed to clients directly. */
    storageKey: text().notNull().unique(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.ownerId)]
);
