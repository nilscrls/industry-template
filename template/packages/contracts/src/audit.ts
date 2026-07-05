import { z } from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  organizationId: z.string().nullable(),
  actorId: z.string().nullable(),
  /** Resolved at read time — survives actor deletion as null. */
  actorEmail: z.string().nullable(),
  /** Dot-scoped verb, e.g. `project.update`. */
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  /** Minimal input snapshot of the mutation. */
  payload: z.record(z.string(), z.unknown()).nullable(),
  /** Correlates with the `traceId` field of logs and traces. */
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().max(100).optional(),
  entityType: z.string().max(100).optional(),
});

export const auditContract = {
  list: base
    .route({
      method: "GET",
      path: "/audit-logs",
      summary: "List audit log entries",
      tags: ["audit"],
    })
    .input(listAuditLogsQuerySchema)
    .output(paginatedSchema(auditLogEntrySchema)),
};
