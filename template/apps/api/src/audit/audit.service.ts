import { Injectable } from "@nestjs/common";
import type {
  AuditLogEntry,
  listAuditLogsQuerySchema,
  Paginated,
} from "@repo/contracts";
import { AuditLog, User } from "@repo/db";
import type { EntityManager, QueryDeepPartialEntity } from "typeorm";
import type { z } from "zod";
import {
  activeOrganizationId,
  currentRequestId,
  currentUser,
} from "../common/request-context";
import { DbService } from "../db/db.module";

type ListQuery = z.infer<typeof listAuditLogsQuerySchema>;

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

    const buildQuery = (m: EntityManager) => {
      const qb = m
        .createQueryBuilder(AuditLog, "a")
        .where("a.organizationId = :orgId", { orgId });
      if (query.action) {
        qb.andWhere("a.action = :action", { action: query.action });
      }
      if (query.entityType) {
        qb.andWhere("a.entityType = :entityType", {
          entityType: query.entityType,
        });
      }
      return qb;
    };

    // Sequential — one QueryRunner/connection serves both queries inside
    // this transaction.
    const [rows, total] = await this.dbService.tenant(async (m) => {
      const foundRows = await buildQuery(m)
        .leftJoin(User, "u", "u.id = a.actorId")
        .addSelect("u.email", "actorEmail")
        .orderBy("a.createdAt", "DESC")
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getRawAndEntities<{ actorEmail: string | null }>();
      const rowCount = await buildQuery(m).getCount();
      return [foundRows, rowCount] as const;
    });

    return {
      items: rows.entities.map((entry, index) =>
        this.toDto(entry, rows.raw[index]?.actorEmail ?? null)
      ),
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
    const row: Partial<AuditLog> = {
      organizationId: activeOrganizationId(),
      actorId: me.id,
      action: meta.action,
      entityType: meta.entityType,
      entityId: entityId ?? null,
      payload,
      requestId: currentRequestId() ?? null,
    };
    // TypeORM's QueryDeepPartialEntity recurses into plain-object columns
    // (the jsonb `payload`), which a `Partial<AuditLog>` doesn't structurally
    // satisfy at the type level even though the runtime value is a plain
    // JSON object — cast at the insert boundary only.
    await this.dbService.tenant((m) =>
      m.insert(AuditLog, row as QueryDeepPartialEntity<AuditLog>)
    );
  }

  private toDto(row: AuditLog, actorEmail: string | null): AuditLogEntry {
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
