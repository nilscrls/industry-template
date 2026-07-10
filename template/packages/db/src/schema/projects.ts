import { projectStatuses } from "@repo/contracts";
import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
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
    // Defense in depth under the CASL/service checks: the runtime role only
    // sees the transaction's tenant (set by DbService.tenant()) plus the
    // user's own rows (GDPR export spans organizations). Writes are
    // tenant-only.
    pgPolicy("project_tenant_isolation", {
      for: "all",
      to: appUserRole,
      using: sql`organization_id = current_setting('app.current_org_id', true) OR owner_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`organization_id = current_setting('app.current_org_id', true)`,
    }),
  ]
).enableRLS();
