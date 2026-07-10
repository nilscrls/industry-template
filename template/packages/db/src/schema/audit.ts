import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { organization } from "./organizations.js";
import { appUserRole } from "./roles.js";

/**
 * Append-only audit trail. Rows outlive their actor and organization
 * (`set null`, not cascade) — deleting a user must not erase their history.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text().references(() => organization.id, {
      onDelete: "set null",
    }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    /** Dot-scoped verb, e.g. `project.update`. */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    /** Minimal input snapshot of the mutation. */
    payload: jsonb().$type<Record<string, unknown> | null>(),
    /** Correlates with the `traceId` field of logs and traces. */
    requestId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organizationId),
    index().on(table.actorId),
    index().on(table.entityType),
    index().on(table.createdAt),
    // Reads: the tenant's rows plus the user's own actions (GDPR export
    // spans orgs). Writes: the tenant's rows, or org-less system events
    // (e.g. the anonymized user.delete entry).
    pgPolicy("audit_log_tenant_isolation", {
      for: "all",
      to: appUserRole,
      using: sql`organization_id = current_setting('app.current_org_id', true) OR actor_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`organization_id IS NULL OR organization_id = current_setting('app.current_org_id', true)`,
    }),
  ]
).enableRLS();
