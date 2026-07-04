import { Injectable } from "@nestjs/common";
import { asSubject } from "@repo/auth";
import {
  projectStatuses,
  type createProjectSchema,
  type listProjectsQuerySchema,
  type Paginated,
  type Project,
  type projectStatsSchema,
  type updateProjectSchema,
} from "@repo/contracts";
import { project } from "@repo/db";
import { and, asc, count, desc, eq, gte, ilike, sql } from "drizzle-orm";
import type * as z from "zod";
import { forbidden, notFound } from "../common/app-error";
import { currentAbility, currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";
import { CacheService } from "../redis/cache.service";

type ListQuery = z.infer<typeof listProjectsQuerySchema>;
type CreateInput = z.infer<typeof createProjectSchema>;
type UpdateInput = z.infer<typeof updateProjectSchema> & { id: string };
type Stats = z.infer<typeof projectStatsSchema>;
type ProjectRow = typeof project.$inferSelect;

const STATS_CACHE_KEY = "projects:stats";
const STATS_TTL_SECONDS = 60;
const STATS_WINDOW_DAYS = 30;

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
    const where = and(
      query.search ? ilike(project.name, `%${query.search}%`) : undefined,
      query.status ? eq(project.status, query.status) : undefined
    );
    const sortColumn = {
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }[query.sortBy];
    const orderBy = query.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

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
    const [row] = await this.db
      .insert(project)
      .values({
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        ownerId: currentUser().id,
      })
      .returning();
    if (!row) {
      throw notFound("Project");
    }
    await this.cache.del(STATS_CACHE_KEY);
    return this.toDto(row);
  }

  async update(input: UpdateInput): Promise<Project> {
    const row = await this.findRow(input.id);
    if (!currentAbility().can("update", asSubject("Project", { ...row }))) {
      throw forbidden("update", "Project");
    }

    const patch: Partial<Pick<ProjectRow, "name" | "description" | "status">> = {};
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

    const [updated] = await this.db.update(project).set(patch).where(eq(project.id, input.id)).returning();
    if (!updated) {
      throw notFound("Project");
    }
    await this.cache.del(STATS_CACHE_KEY);
    return this.toDto(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.findRow(id);
    if (!currentAbility().can("delete", asSubject("Project", { ...row }))) {
      throw forbidden("delete", "Project");
    }
    await this.db.delete(project).where(eq(project.id, id));
    await this.cache.del(STATS_CACHE_KEY);
    return { id };
  }

  stats(): Promise<Stats> {
    return this.cache.getOrSet(STATS_CACHE_KEY, STATS_TTL_SECONDS, () => this.computeStats());
  }

  private async computeStats(): Promise<Stats> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));
    const dayExpr = sql<string>`to_char(date_trunc('day', ${project.createdAt}), 'YYYY-MM-DD')`;

    const [totals, byStatusRows, perDayRows] = await Promise.all([
      this.db.select({ value: count() }).from(project),
      this.db.select({ status: project.status, count: count() }).from(project).groupBy(project.status),
      this.db
        .select({ date: dayExpr, count: count() })
        .from(project)
        .where(gte(project.createdAt, since))
        .groupBy(dayExpr),
    ]);

    const byStatus = projectStatuses.map((status) => ({
      status,
      count: byStatusRows.find((row) => row.status === status)?.count ?? 0,
    }));

    const counts = new Map(perDayRows.map((row) => [row.date, row.count]));
    const createdPerDay = Array.from({ length: STATS_WINDOW_DAYS }, (_, index) => {
      const day = new Date(since);
      day.setUTCDate(since.getUTCDate() + index);
      const date = day.toISOString().slice(0, 10);
      return { date, count: counts.get(date) ?? 0 };
    });

    return { total: totals[0]?.value ?? 0, byStatus, createdPerDay };
  }

  private async findRow(id: string): Promise<ProjectRow> {
    const [row] = await this.db.select().from(project).where(eq(project.id, id));
    if (!row) {
      throw notFound("Project");
    }
    return row;
  }

  private toDto(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
