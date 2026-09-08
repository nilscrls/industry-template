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
import { Project as ProjectEntity } from "@repo/db";
import type { EntityManager } from "typeorm";
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

const STATS_TTL_SECONDS = 60;
const STATS_WINDOW_DAYS = 30;
// Scoped through cache.forOrg(orgId), so the full key carries the tenant id.
const STATS_KEY = "projects:stats";

interface RowFlags {
  canDelete: boolean;
  canUpdate: boolean;
}

const SORT_COLUMNS = {
  name: "name",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

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
    const sortColumn = SORT_COLUMNS[query.sortBy];

    const [rows, total] = await this.dbService.tenant(async (m) => {
      const qb = this.baseQuery(m, orgId, query.search, query.status).orderBy(
        `p.${sortColumn}`,
        query.sortOrder === "asc" ? "ASC" : "DESC"
      );
      const foundRows = await qb
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getMany();
      const rowCount = await this.baseQuery(
        m,
        orgId,
        query.search,
        query.status
      ).getCount();
      return [foundRows, rowCount] as const;
    });
    const flags = await this.flagsFor(rows);

    return {
      items: rows.map((row) => this.toDto(row, flags.get(row.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async find(id: string): Promise<Project> {
    const row = await this.dbService.tenant((m) => this.findRow(m, id));
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
    const row = await this.dbService.tenant(async (m) => {
      const result = await m
        .createQueryBuilder()
        .insert()
        .into(ProjectEntity)
        .values({
          name: input.name,
          description: input.description ?? null,
          status: input.status,
          organizationId: orgId,
          ownerId: me.id,
        })
        .returning("*")
        .execute();
      const created = result.raw[0] as ProjectEntity | undefined;
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
    const row = await this.dbService.tenant((m) => this.findRow(m, input.id));
    if (!(await this.can("can_update", row.id))) {
      throw forbidden("update", "Project");
    }

    const patch: Partial<
      Pick<ProjectEntity, "name" | "description" | "status">
    > = {};
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
        : await this.dbService.tenant(async (m) => {
            const result = await m
              .createQueryBuilder()
              .update(ProjectEntity)
              // The entity keeps `updatedAt` a plain column (no @UpdateDateColumn)
              // so migration:generate stays quiet — writers bump it explicitly.
              .set({ ...patch, updatedAt: () => "now()" })
              .where("id = :id", { id: input.id })
              .returning("*")
              .execute();
            const next = result.raw[0] as ProjectEntity | undefined;
            if (!next || result.affected !== 1) {
              throw notFound("Project");
            }
            return next;
          });
    await this.cache.forOrg(updated.organizationId).del(STATS_KEY);
    const flags = await this.flagsFor([updated]);
    return this.toDto(updated, flags.get(updated.id));
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.dbService.tenant((m) => this.findRow(m, id));
    if (!(await this.can("can_delete", row.id))) {
      throw forbidden("delete", "Project");
    }
    await this.dbService.tenant(async (m) => {
      const result = await m.delete(ProjectEntity, { id });
      if (result.affected !== 1) {
        throw notFound("Project");
      }
    });
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
  private async flagsFor(
    rows: ProjectEntity[]
  ): Promise<Map<string, RowFlags>> {
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

  /** Shared WHERE for list()'s page query and its count query. */
  private baseQuery(
    manager: EntityManager,
    orgId: string,
    search: string | undefined,
    status: (typeof projectStatuses)[number] | undefined
  ) {
    const qb = manager
      .createQueryBuilder(ProjectEntity, "p")
      .where("p.organizationId = :orgId", { orgId });
    if (search) {
      qb.andWhere("p.name ILIKE :search", { search: `%${search}%` });
    }
    if (status) {
      qb.andWhere("p.status = :status", { status });
    }
    return qb;
  }

  private async computeStats(orgId: string): Promise<Stats> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));

    // Sequential (not Promise.all): one TypeORM QueryRunner executes
    // queries serially over its single connection inside a transaction —
    // concurrent queries against the same manager would race, not parallelize.
    const [total, byStatusRows, perDayRows] = await this.dbService.tenant(
      async (m) => {
        const totalCount = await m
          .createQueryBuilder(ProjectEntity, "p")
          .where("p.organizationId = :orgId", { orgId })
          .getCount();
        const byStatus = await m
          .createQueryBuilder(ProjectEntity, "p")
          .select("p.status", "status")
          .addSelect("count(*)", "count")
          .where("p.organizationId = :orgId", { orgId })
          .groupBy("p.status")
          .getRawMany<{
            count: string;
            status: Stats["byStatus"][number]["status"];
          }>();
        const perDay = await m
          .createQueryBuilder(ProjectEntity, "p")
          .select(
            "to_char(date_trunc('day', p.createdAt), 'YYYY-MM-DD')",
            "date"
          )
          .addSelect("count(*)", "count")
          .where("p.organizationId = :orgId", { orgId })
          .andWhere("p.createdAt >= :since", { since })
          .groupBy("date")
          .getRawMany<{ count: string; date: string }>();
        return [totalCount, byStatus, perDay] as const;
      }
    );

    const byStatus = projectStatuses.map((status) => ({
      status,
      count: Number(
        byStatusRows.find((row) => row.status === status)?.count ?? 0
      ),
    }));

    const counts = new Map(
      perDayRows.map((row) => [row.date, Number(row.count)])
    );
    const createdPerDay = Array.from(
      { length: STATS_WINDOW_DAYS },
      (_, index) => {
        const day = new Date(since);
        day.setUTCDate(since.getUTCDate() + index);
        const date = day.toISOString().slice(0, 10);
        return { date, count: counts.get(date) ?? 0 };
      }
    );

    return { total, byStatus, createdPerDay };
  }

  /** Rows outside the active organization do not exist for this request. */
  private async findRow(
    manager: EntityManager,
    id: string
  ): Promise<ProjectEntity> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("Project");
    }
    const row = await manager.findOne(ProjectEntity, {
      where: { id, organizationId: orgId },
    });
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

  private toDto(row: ProjectEntity, flags?: RowFlags): Project {
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
