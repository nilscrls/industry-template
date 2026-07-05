import { Injectable } from "@nestjs/common";
import type {
  AuditLogEntry,
  listAuditLogsQuerySchema,
  Paginated,
} from "@repo/contracts";
import { auditLog, user } from "@repo/db";
import { and, count, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import {
  activeOrganizationId,
  currentRequestId,
  currentUser,
} from "../common/request-context";
import { DbService } from "../db/db.module";

type ListQuery = z.infer<typeof listAuditLogsQuerySchema>;
type AuditRow = typeof auditLog.$inferSelect;

export interface AuditedMeta<TInput, TOutput> {
  action: string;
  /** Override when the id is not `output.id` (nor `input.id`). */
  entityId?: (input: TInput, output: TOutput) => string | undefined;
  entityType: string;
}

function defaultEntityId(input: unknown, output: unknown): string | undefined {
  for (const candidate of [output, input]) {
    if (
      candidate &&
      typeof candidate === "object" &&
      "id" in candidate &&
      typeof candidate.id === "string"
    ) {
      return candidate.id;
    }
  }
  return;
}

@Injectable()
export class AuditService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  /**
   * THE choke point for audit writes: an oRPC middleware attached to every
   * mutating procedure (`implement(...).use(audit.audited({...}))`). It runs
   * after the handler succeeds; a failed audit insert fails the request — an
   * audit trail that drops entries silently is worse than a failed mutation.
   */
  audited<TInput, TOutput>(meta: AuditedMeta<TInput, TOutput>) {
    return async <TResult extends { output: TOutput }>(
      options: { next: () => TResult | PromiseLike<TResult> },
      input: TInput
    ): Promise<TResult> => {
      const result = await options.next();
      await this.record(meta, input, result.output);
      return result;
    };
  }

  async list(query: ListQuery): Promise<Paginated<AuditLogEntry>> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: 0,
      };
    }
    const where = and(
      eq(auditLog.organizationId, orgId),
      query.action ? eq(auditLog.action, query.action) : undefined,
      query.entityType ? eq(auditLog.entityType, query.entityType) : undefined
    );

    const [rows, totals] = await Promise.all([
      this.db
        .select({ entry: auditLog, actorEmail: user.email })
        .from(auditLog)
        .leftJoin(user, eq(user.id, auditLog.actorId))
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(auditLog).where(where),
    ]);

    const total = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => this.toDto(row.entry, row.actorEmail)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  private async record<TInput, TOutput>(
    meta: AuditedMeta<TInput, TOutput>,
    input: TInput,
    output: TOutput
  ): Promise<void> {
    const me = currentUser();
    const entityId = meta.entityId
      ? meta.entityId(input, output)
      : defaultEntityId(input, output);
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : null;
    await this.db.insert(auditLog).values({
      organizationId: activeOrganizationId(),
      actorId: me.id,
      action: meta.action,
      entityType: meta.entityType,
      entityId: entityId ?? null,
      payload,
      requestId: currentRequestId() ?? null,
    });
  }

  private toDto(row: AuditRow, actorEmail: string | null): AuditLogEntry {
    return {
      id: row.id,
      organizationId: row.organizationId,
      actorId: row.actorId,
      actorEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
