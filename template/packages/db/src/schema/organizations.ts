import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { appUserRole } from "./roles.js";

/**
 * Better-Auth organization plugin tables — the tenancy foundation. Every
 * tenant-owned row (projects, files, audit entries) carries an
 * `organizationId` foreign key to `organization`.
 */
export const organization = pgTable("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  metadata: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }),
});

export const member = pgTable(
  "member",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().notNull().default("member"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organizationId),
    index().on(table.userId),
    // The user's own memberships stay readable pre-tenant (org switcher,
    // GDPR export); admins read across tenants (member counts). Better-Auth
    // itself uses the BYPASSRLS app_auth pool.
    pgPolicy("member_tenant_isolation", {
      for: "all",
      to: appUserRole,
      using: sql`organization_id = current_setting('app.current_org_id', true) OR user_id = current_setting('app.current_user_id', true) OR current_setting('app.is_admin', true) = 'true'`,
      withCheck: sql`organization_id = current_setting('app.current_org_id', true)`,
    }),
  ]
).enableRLS();

export const invitation = pgTable(
  "invitation",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().notNull().default("pending"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    inviterId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organizationId),
    index().on(table.email),
    pgPolicy("invitation_tenant_isolation", {
      for: "all",
      to: appUserRole,
      using: sql`organization_id = current_setting('app.current_org_id', true)`,
      withCheck: sql`organization_id = current_setting('app.current_org_id', true)`,
    }),
  ]
).enableRLS();
