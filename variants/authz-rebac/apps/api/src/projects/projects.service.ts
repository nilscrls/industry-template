import { Injectable } from "@nestjs/common";
import {
  type createProjectSchema,
  type listProjectsQuerySchema,
  type Paginated,
  type Project,
  type ProjectMember,
  type ProjectRelation,
  projectRelationSchema,
  projectRelations,
  type projectStatsSchema,
  projectStatuses,
  type updateProjectSchema,
} from "@repo/contracts";
import {
  Project as ProjectEntity,
  ProjectMember as ProjectMemberEntity,
  User,
} from "@repo/db";
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

/**
 * ReBAC: the `projectMember` table is the DB source of truth for
 * relations; every write mirrors into an OpenFGA tuple (owner/editor/
 * viewer on `project:<id>`). Row checks ask FGA; Postgres RLS runs
 * underneath via dbService.tenant(...) (projectMember itself has NO RLS —
 * see docs/authorization.md).
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbService: DbService,
    private readonly cache: CacheService,
    private readonly fga: FgaService
  ) {}

  async list(query: ListQuery): Promise<Paginated<Project>> {
    const me = currentUser();
    const orgId = activeOrganizationId();
    if (!orgId) {
      return this.emptyPage(query);
    }

    const [rows, total] = await this.dbService.tenant(async (m) => {
      const qb = m
        .createQueryBuilder(ProjectEntity, "p")
        .where("p.organizationId = :orgId", { orgId });

      // ReBAC: non-admins only ever see projects they hold a relation on.
      // `qb.subQuery()` shares the outer query builder's parameter bag, so
      // this is a true SQL subquery in the same statement (one round trip,
      // same tenant() transaction/RLS context) — not a second query.
      if ((me.role ?? "user") !== "admin") {
        const membershipSub = qb
          .subQuery()
          .select("pm.projectId")
          .from(ProjectMemberEntity, "pm")
          .where("pm.userId = :userId", { userId: me.id })
          .getQuery();
        qb.andWhere(`p.id IN ${membershipSub}`);
      }
      if (query.search) {
        qb.andWhere("p.name ILIKE :search", { search: `%${query.search}%` });
      }
      if (query.status) {
        qb.andWhere("p.status = :status", { status: query.status });
      }
      qb.orderBy(
        `p.${query.sortBy}`,
        query.sortOrder === "asc" ? "ASC" : "DESC"
      );

      // Sequential inside one tenant(): count first, then the page.
      const rowCount = await qb.getCount();
      const page = await qb
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .getMany();
      return [page, rowCount] as const;
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
    if (!(await this.can("can_read", row.id))) {
      throw forbidden("read", "Project");
    }
    const flags = await this.flagsFor([row]);
    return this.toDto(row, flags.get(row.id));
  }

  async create(input: CreateInput): Promise<Project> {
    const me = currentUser();
    const orgId = activeOrganizationId();
    if (!orgId) {
      // Creating requires a tenant to create into.
      throw forbidden("create", "Project");
    }
    const row = await this.dbService.tenant(async (m) => {
      const created = await m.save(ProjectEntity, {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        organizationId: orgId,
        ownerId: me.id,
      });
      // The creator's `owner` relation IS the permission grant.
      await m.insert(ProjectMemberEntity, {
        projectId: created.id,
        userId: me.id,
        relation: "owner",
      });
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
              .set({ ...patch, updatedAt: () => "now()" })
              .where("id = :id", { id: input.id })
              .returning("*")
              .execute();
            if (result.affected !== 1) {
              throw notFound("Project");
            }
            return m.create(ProjectEntity, result.raw[0] as ProjectEntity);
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
    // FK cascade removes the membership rows with the project.
    await this.dbService.tenant(async (m) => {
      const result = await m.delete(ProjectEntity, { id });
      if (result.affected !== 1) {
        throw notFound("Project");
      }
    });
    // Drop every tuple attached to the deleted resource (org link and all
    // owner/editor/viewer relations).
    await this.fga.deleteObjectTuples(this.fga.ref.project(id));
    await this.cache.forOrg(row.organizationId).del(STATS_KEY);
    return { id };
  }

  async listMembers(projectId: string): Promise<{ members: ProjectMember[] }> {
    const row = await this.dbService.tenant((m) => this.findRow(m, projectId));
    if (!(await this.can("can_read", row.id))) {
      throw forbidden("read", "Project");
    }
    const rows = await this.dbService.tenant((m) =>
      m
        .createQueryBuilder(ProjectMemberEntity, "pm")
        .innerJoin(User, "u", "u.id = pm.userId")
        .where("pm.projectId = :projectId", { projectId })
        .select([
          // Raw aliases must be double-quoted or Postgres folds them to
          // lowercase and getRawMany()'s keys stop matching these camelCase
          // properties (naming rule, D1).
          'pm.userId AS "userId"',
          'u.name AS "name"',
          'u.email AS "email"',
          'pm.relation AS "relation"',
        ])
        .getRawMany<{
          email: string;
          name: string;
          relation: string;
          userId: string;
        }>()
    );
    return {
      members: rows.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        relation: projectRelationSchema.parse(member.relation),
      })),
    };
  }

  async setMember(input: {
    id: string;
    userId: string;
    relation: ProjectRelation;
  }): Promise<ProjectMember> {
    const target = await this.dbService.tenant(async (m) => {
      const row = await this.requireManage(m, input.id);
      const found = await m.findOneBy(User, { id: input.userId });
      if (!found) {
        throw notFound("User");
      }
      if (input.relation !== "owner") {
        await this.assertAnotherOwnerRemains(m, row.id, input.userId);
      }
      // Composite conflict target: TypeORM's Repository.upsert doesn't
      // accept a multi-column conflict target portably across drivers, so
      // this is raw SQL (naming rule: double-quote every camelCase ident).
      await m.query(
        `insert into "projectMember" ("projectId", "userId", "relation")
         values ($1, $2, $3)
         on conflict ("projectId", "userId") do update set "relation" = $3`,
        [row.id, input.userId, input.relation]
      );
      return found;
    });
    // Mirror the row: exactly one relation tuple per (user, project).
    await this.syncMemberTuples(input.id, input.userId, input.relation);
    return {
      userId: target.id,
      name: target.name,
      email: target.email,
      relation: input.relation,
    };
  }

  async removeMember(input: {
    id: string;
    userId: string;
  }): Promise<{ userId: string }> {
    await this.dbService.tenant(async (m) => {
      const row = await this.requireManage(m, input.id);
      await this.assertAnotherOwnerRemains(m, row.id, input.userId);
      await m.delete(ProjectMemberEntity, {
        projectId: row.id,
        userId: input.userId,
      });
    });
    await this.syncMemberTuples(input.id, input.userId, null);
    return { userId: input.userId };
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

  /** Replace the user's relation tuples on a project (null = remove all). */
  private async syncMemberTuples(
    projectId: string,
    userId: string,
    relation: ProjectRelation | null
  ): Promise<void> {
    const object = this.fga.ref.project(projectId);
    const subject = this.fga.ref.user(userId);
    await this.fga.deleteTuples(
      projectRelations
        .filter((candidate) => candidate !== relation)
        .map((candidate) => ({ user: subject, relation: candidate, object }))
    );
    if (relation) {
      await this.fga.writeTuples([{ user: subject, relation, object }]);
    }
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

  private async computeStats(orgId: string): Promise<Stats> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (STATS_WINDOW_DAYS - 1));

    // Sequential inside one tenant(): three round trips, one transaction.
    const [total, byStatusRows, perDayRows] = await this.dbService.tenant(
      async (m) => {
        const base = () =>
          m
            .createQueryBuilder(ProjectEntity, "p")
            .where("p.organizationId = :orgId", { orgId });

        const totalCount = await base().getCount();
        const byStatus = await base()
          .select("p.status", "status")
          .addSelect("count(*)", "count")
          .groupBy("p.status")
          .getRawMany<{ count: string; status: string }>();
        const perDay = await base()
          .andWhere("p.createdAt >= :since", { since })
          .select(
            "to_char(date_trunc('day', p.createdAt), 'YYYY-MM-DD')",
            "date"
          )
          .addSelect("count(*)", "count")
          .groupBy("date")
          .getRawMany<{ count: string; date: string }>();
        return [totalCount, byStatus, perDay] as const;
      }
    );

    const byStatus = projectStatuses.map((status) => ({
      status,
      count:
        Number(byStatusRows.find((row) => row.status === status)?.count ?? 0) ||
        0,
    }));

    const counts = new Map(
      perDayRows.map((row) => [row.date, Number(row.count) || 0])
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

  /** Membership writes require manage rights (owner or admin). */
  private async requireManage(
    m: EntityManager,
    projectId: string
  ): Promise<ProjectEntity> {
    const row = await this.findRow(m, projectId);
    if (!(await this.can("can_manage_members", row.id))) {
      throw forbidden("manage", "Project");
    }
    return row;
  }

  /** A project must always keep at least one owner. */
  private async assertAnotherOwnerRemains(
    m: EntityManager,
    projectId: string,
    excludedUserId: string
  ): Promise<void> {
    const owners = await m.find(ProjectMemberEntity, {
      where: { projectId, relation: "owner" },
      select: { userId: true },
    });
    const remaining = owners.filter((owner) => owner.userId !== excludedUserId);
    if (remaining.length === 0) {
      throw forbidden("remove the last owner of", "Project");
    }
  }

  /** Rows outside the active organization do not exist for this request. */
  private async findRow(m: EntityManager, id: string): Promise<ProjectEntity> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("Project");
    }
    const row = await m.findOneBy(ProjectEntity, {
      id,
      organizationId: orgId,
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
