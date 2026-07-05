import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { organization } from "./organizations.js";

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
  ]
);
