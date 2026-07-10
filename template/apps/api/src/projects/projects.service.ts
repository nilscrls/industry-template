import { Injectable } from "@nestjs/common";
import {
  type createProjectSchema,
  type listProjectsQuerySchema,
  type Paginated,
  type Project,
  type projectStatsSchema,
  projectStatuses,
  type updateProjectSchema,
} from "@repo/contracts";
import { type Database, project } from "@repo/db";
import { and, asc, count, desc, eq, gte, ilike, sql } from "drizzle-orm";
import type { z } from "zod";
import { forbidden, notFound } from "../common/app-error";
import { activeOrganizationId, currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";
import { CacheService } from "../redis/cache.service";

type ListQuery = z.infer<typeof listProjectsQuerySchema>;
type CreateInput = z.infer<typeof createProjectSchema>;
type UpdateInput = z.infer<typeof updateProjectSchema> & { id: string };
type Stats = z.infer<typeof projectStatsSchema>;
type ProjectRow = typeof project.$inferSelect;

const STATS_TTL_SECONDS = 60;
const STATS_WINDOW_DAYS = 30;
// Scoped through cache.forOrg(orgId), so the full key carries the tenant id.
const STATS_KEY = "projects:stats";

interface RowFlags {
  canDelete: boolean;
  canUpdate: boolean;
}

/**
 * Authorization is two-layered: OpenFGA row checks here (can_update /
 * can_delete on `project:<id>`), Postgres RLS underneath via
 * dbService.tenant(...). The explicit organizationId filters stay — RLS is
 * the safety net, not the primary filter.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbService: DbService,
    private readonly cache: CacheService,
    private readonly fga: FgaService
  ) {}

  async list(query: ListQuery): Promise<Paginated<Project>> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      return this.emptyPage(query);
    }
    const where = and(
      eq(project.organizationId, orgId),
      query.search ? ilike(project.name, `%${query.search}%`) : undefined,
      query.status ? eq(project.status, query.status) : undefined
    );
    const sortColumn = {
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }[query.sortBy];
    const orderBy =
      query.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const [rows, totals] = await this.dbService.tenant((db) =>
      Promise.all([
        db
          .select()
          .from(project)
          .where(where)
          .orderBy(orderBy)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ value: count() }).from(project).where(where),
      ])
    );
    const flags = await this.flagsFor(rows);

    const total = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => this.toDto(row, flags.get(row.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async find(id: string): Promise<Project> {
    const row = await this.dbService.tenant((db) => this.findRow(db, id));
    const [canRead] = await this.fga.batchCheck([
      {
        user: this.fga.me(),
        relation: "can_read",
        object: this.fga.ref.project(row.id),
      },
    ]);
    if (!canRead) {
      throw forbidden("read", "Project");
    }
    const flags = await this.flagsFor([row]);
    return this.toDto(row, flags.get(row.id));
  }

  async create(input: CreateInput): Promise<Project> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      // Creating requires a tenant to create into.
      throw forbidden("create", "Project");
    }
    const me = currentUser();
    const row = await this.dbService.tenant(async (db) => {
      const [created] = await db
        .insert(project)
        .values({
          name: input.name,
          description: input.description ?? null,
          status: input.status,
          organizationId: orgId,
          ownerId: me.id,
        })
        .returning();
      if (!created) {
        throw notFound("Project");
      }
      return created;
    });
    // Tuples AFTER the DB commit (Postgres is the source of truth). A
    // failure here surfaces as a 500 — rerun `pnpm fga:sync` to reconcile.
    await this.fga.writeTuples([
      {
        user: this.fga.ref.org(orgId),
        relation: "org",
        object: this.fga.ref.project(row.id),
      },
      {
        user: this.fga.ref.user(me.id),
        relation: "owner",
        object: this.fga.ref.project(row.id),
      },
    ]);
    await this.cache.forOrg(orgId).del(STATS_KEY);
    // The creator owns the project — no need to re-ask FGA.
    return this.toDto(row, { canUpdate: true, canDelete: true });
  }

  async update(input: UpdateInput): Promise<Project> {
    const row = await this.dbService.tenant((db) => this.findRow(db, input.id));
    if (!(await this.can("can_update", row.id))) {
      throw forbidden("update", "Project");
    }

    const patch: Partial<Pick<ProjectRow, "name" | "description" | "status">> =
      {};
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    const updated =
      Object.keys(patch).length === 0
        ? row
        : await this.dbService.tenant(async (db) => {
            const [next] = await db
              .update(project)
              .set(patch)
              .where(eq(project.id, input.id))
              .returning();
            if (!next) {
              throw notFound("Project");
            }
            return next;
          });
    await this.cache.forOrg(updated.organizationId).del(STATS_KEY);
    const flags = await this.flagsFor([updated]);
    return this.toDto(updated, flags.get(updated.id));
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.dbService.tenant((db) => this.findRow(db, id));
    if (!(await this.can("can_delete", row.id))) {
      throw forbidden("delete", "Project");
    }
    await this.dbService.tenant((db) =>
      db.delete(project).where(eq(project.id, id))
    );
    // Drop every tuple attached to the deleted resource (org link, owner,
    // any per-user grants).
    await this.fga.deleteObjectTuples(this.fga.ref.project(id));
    await this.cache.forOrg(row.organizationId).del(STATS_KEY);
    return { id };
  }

  stats(): Promise<Stats> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      return Promise.resolve(this.emptyStats());
    }
    return this.cache
      .forOrg(orgId)
      .getOrSet(STATS_KEY, STATS_TTL_SECONDS, () => this.computeStats(orgId));
  }

  private can(relation: string, projectId: string): Promise<boolean> {
    return this.fga.check(
      this.fga.me(),
      relation,
      this.fga.ref.project(projectId)
    );
  }

  /** Row-level UI hints, one BatchCheck for the whole page. */
  private async flagsFor(rows: ProjectRow[]): Promise<Map<string, RowFlags>> {
    if (rows.length === 0) {
      return new Map();
    }
    const me = this.fga.me();
    const checks = rows.flatMap((row) => [
      {
        user: me,
        relation: "can_update",
        object: this.fga.ref.project(row.id),
      },
      {
        user: me,
        relation: "can_delete",
        object: this.fga.ref.project(row.id),
      },
    ]);
    const results = await this.fga.batchCheck(checks);
    return new Map(
      rows.map((row, index) => [
        row.id,
        {
          canUpdate: results[index * 2] === true,
          canDelete: results[index * 2 + 1] === true,
        },
      ])
    );
  }

  private async computeStats(orgId: string): Promise<Stats> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));
    const dayExpr = sql<string>`to_char(date_trunc('day', ${project.createdAt}), 'YYYY-MM-DD')`;
    const inOrg = eq(project.organizationId, orgId);

    const [totals, byStatusRows, perDayRows] = await this.dbService.tenant(
      (db) =>
        Promise.all([
          db.select({ value: count() }).from(project).where(inOrg),
          db
            .select({ status: project.status, count: count() })
            .from(project)
            .where(inOrg)
            .groupBy(project.status),
          db
            .select({ date: dayExpr, count: count() })
            .from(project)
            .where(and(inOrg, gte(project.createdAt, since)))
            .groupBy(dayExpr),
        ])
    );

    const byStatus = projectStatuses.map((status) => ({
      status,
      count: byStatusRows.find((row) => row.status === status)?.count ?? 0,
    }));

    const counts = new Map(perDayRows.map((row) => [row.date, row.count]));
    const createdPerDay = Array.from(
      { length: STATS_WINDOW_DAYS },
      (_, index) => {
        const day = new Date(since);
        day.setUTCDate(since.getUTCDate() + index);
        const date = day.toISOString().slice(0, 10);
        return { date, count: counts.get(date) ?? 0 };
      }
    );

    return { total: totals[0]?.value ?? 0, byStatus, createdPerDay };
  }

  /** Rows outside the active organization do not exist for this request. */
  private async findRow(db: Database, id: string): Promise<ProjectRow> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("Project");
    }
    const [row] = await db
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.organizationId, orgId)));
    if (!row) {
      throw notFound("Project");
    }
    return row;
  }

  private emptyPage(query: ListQuery): Paginated<Project> {
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: 0,
    };
  }

  private emptyStats(): Stats {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));
    return {
      total: 0,
      byStatus: projectStatuses.map((status) => ({ status, count: 0 })),
      createdPerDay: Array.from({ length: STATS_WINDOW_DAYS }, (_, index) => {
        const day = new Date(since);
        day.setUTCDate(since.getUTCDate() + index);
        return { date: day.toISOString().slice(0, 10), count: 0 };
      }),
    };
  }

  private toDto(row: ProjectRow, flags?: RowFlags): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      organizationId: row.organizationId,
      ownerId: row.ownerId,
      canUpdate: flags?.canUpdate ?? false,
      canDelete: flags?.canDelete ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
