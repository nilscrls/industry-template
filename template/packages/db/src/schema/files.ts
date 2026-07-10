import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { organization } from "./organizations.js";
import { appUserRole } from "./roles.js";

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
  (table) => [
    index().on(table.organizationId),
    index().on(table.ownerId),
    // Tenant rows plus the user's own uploads (GDPR export spans orgs).
    pgPolicy("file_object_tenant_isolation", {
      for: "all",
      to: appUserRole,
      using: sql`organization_id = current_setting('app.current_org_id', true) OR owner_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`organization_id = current_setting('app.current_org_id', true)`,
    }),
  ]
).enableRLS();
