import { Injectable } from "@nestjs/common";
import { asSubject } from "@repo/auth";
import {
  type createProjectSchema,
  type listProjectsQuerySchema,
  type Paginated,
  type Project,
  type projectStatsSchema,
  projectStatuses,
  type updateProjectSchema,
} from "@repo/contracts";
import { project } from "@repo/db";
import { and, asc, count, desc, eq, gte, ilike, sql } from "drizzle-orm";
import type { z } from "zod";
import { forbidden, notFound } from "../common/app-error";
import {
  activeOrganizationId,
  currentAbility,
  currentUser,
} from "../common/request-context";
import { DbService } from "../db/db.module";
import { CacheService } from "../redis/cache.service";

type ListQuery = z.infer<typeof listProjectsQuerySchema>;
type CreateInput = z.infer<typeof createProjectSchema>;
type UpdateInput = z.infer<typeof updateProjectSchema> & { id: string };
type Stats = z.infer<typeof projectStatsSchema>;
type ProjectRow = typeof project.$inferSelect;

const STATS_TTL_SECONDS = 60;
const STATS_WINDOW_DAYS = 30;

function statsCacheKey(organizationId: string): string {
  return `projects:stats:${organizationId}`;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbService: DbService,
    private readonly cache: CacheService
  ) {}

  private get db() {
    return this.dbService.db;
  }

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

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(project)
        .where(where)
        .orderBy(orderBy)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(project).where(where),
    ]);

    const total = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async find(id: string): Promise<Project> {
    const row = await this.findRow(id);
    if (!currentAbility().can("read", asSubject("Project", { ...row }))) {
      throw forbidden("read", "Project");
    }
    return this.toDto(row);
  }

  async create(input: CreateInput): Promise<Project> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      // Creating requires a tenant to create into.
      throw forbidden("create", "Project");
    }
    const [row] = await this.db
      .insert(project)
      .values({
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        organizationId: orgId,
        ownerId: currentUser().id,
      })
      .returning();
    if (!row) {
      throw notFound("Project");
    }
    await this.cache.del(statsCacheKey(orgId));
    return this.toDto(row);
  }

  async update(input: UpdateInput): Promise<Project> {
    const row = await this.findRow(input.id);
    if (!currentAbility().can("update", asSubject("Project", { ...row }))) {
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
    if (Object.keys(patch).length === 0) {
      return this.toDto(row);
    }

    const [updated] = await this.db
      .update(project)
      .set(patch)
      .where(eq(project.id, input.id))
      .returning();
    if (!updated) {
      throw notFound("Project");
    }
    await this.cache.del(statsCacheKey(row.organizationId));
    return this.toDto(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.findRow(id);
    if (!currentAbility().can("delete", asSubject("Project", { ...row }))) {
      throw forbidden("delete", "Project");
    }
    await this.db.delete(project).where(eq(project.id, id));
    await this.cache.del(statsCacheKey(row.organizationId));
    return { id };
  }

  stats(): Promise<Stats> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      return Promise.resolve(this.emptyStats());
    }
    return this.cache.getOrSet(statsCacheKey(orgId), STATS_TTL_SECONDS, () =>
      this.computeStats(orgId)
    );
  }

  private async computeStats(orgId: string): Promise<Stats> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));
    const dayExpr = sql<string>`to_char(date_trunc('day', ${project.createdAt}), 'YYYY-MM-DD')`;
    const inOrg = eq(project.organizationId, orgId);

    const [totals, byStatusRows, perDayRows] = await Promise.all([
      this.db.select({ value: count() }).from(project).where(inOrg),
      this.db
        .select({ status: project.status, count: count() })
        .from(project)
        .where(inOrg)
        .groupBy(project.status),
      this.db
        .select({ date: dayExpr, count: count() })
        .from(project)
        .where(and(inOrg, gte(project.createdAt, since)))
        .groupBy(dayExpr),
    ]);

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
  private async findRow(id: string): Promise<ProjectRow> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("Project");
    }
    const [row] = await this.db
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

  private toDto(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      organizationId: row.organizationId,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
