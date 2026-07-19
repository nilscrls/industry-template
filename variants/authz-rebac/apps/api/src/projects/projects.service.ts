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
import { type Database, project, projectMember, user } from "@repo/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  sql,
} from "drizzle-orm";
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
 * ReBAC: the `project_member` table is the DB source of truth for
 * relations; every write mirrors into an OpenFGA tuple (owner/editor/
 * viewer on `project:<id>`). Row checks ask FGA; Postgres RLS runs
 * underneath via dbService.tenant(...).
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
    // ReBAC: non-admins only ever see projects they hold a relation on.
    // The DB join stays (pageable, index-friendly); FGA re-answers the
    // same question per row via the can_* checks.
    const membershipScope =
      (me.role ?? "member") === "admin"
        ? undefined
        : inArray(
            project.id,
            this.dbService.db
              .select({ id: projectMember.projectId })
              .from(projectMember)
              .where(eq(projectMember.userId, me.id))
          );
    const where = and(
      eq(project.organizationId, orgId),
      membershipScope,
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
    const row = await this.dbService.tenant(async (tx) => {
      const [created] = await tx
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
      // The creator's `owner` relation IS the permission grant.
      await tx.insert(projectMember).values({
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
    // FK cascade removes the membership rows with the project.
    await this.dbService.tenant((db) =>
      db.delete(project).where(eq(project.id, id))
    );
    // Drop every tuple attached to the deleted resource (org link and all
    // owner/editor/viewer relations).
    await this.fga.deleteObjectTuples(this.fga.ref.project(id));
    await this.cache.forOrg(row.organizationId).del(STATS_KEY);
    return { id };
  }

  async listMembers(projectId: string): Promise<{ members: ProjectMember[] }> {
    const row = await this.dbService.tenant((db) =>
      this.findRow(db, projectId)
    );
    if (!(await this.can("can_read", row.id))) {
      throw forbidden("read", "Project");
    }
    const rows = await this.dbService.tenant((db) =>
      db
        .select({
          userId: projectMember.userId,
          name: user.name,
          email: user.email,
          relation: projectMember.relation,
        })
        .from(projectMember)
        .innerJoin(user, eq(user.id, projectMember.userId))
        .where(eq(projectMember.projectId, projectId))
    );
    return {
      members: rows.map((member) => ({
        ...member,
        relation: projectRelationSchema.parse(member.relation),
      })),
    };
  }

  async setMember(input: {
    id: string;
    userId: string;
    relation: ProjectRelation;
  }): Promise<ProjectMember> {
    const target = await this.dbService.tenant(async (db) => {
      const row = await this.requireManage(db, input.id);
      const [found] = await db
        .select()
        .from(user)
        .where(eq(user.id, input.userId));
      if (!found) {
        throw notFound("User");
      }
      if (input.relation !== "owner") {
        await this.assertAnotherOwnerRemains(db, row.id, input.userId);
      }
      await db
        .insert(projectMember)
        .values({
          projectId: row.id,
          userId: input.userId,
          relation: input.relation,
        })
        .onConflictDoUpdate({
          target: [projectMember.projectId, projectMember.userId],
          set: { relation: input.relation },
        });
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
    await this.dbService.tenant(async (db) => {
      const row = await this.requireManage(db, input.id);
      await this.assertAnotherOwnerRemains(db, row.id, input.userId);
      await db
        .delete(projectMember)
        .where(
          and(
            eq(projectMember.projectId, row.id),
            eq(projectMember.userId, input.userId)
          )
        );
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

  /** Membership writes require manage rights (owner or admin). */
  private async requireManage(
    db: Database,
    projectId: string
  ): Promise<ProjectRow> {
    const row = await this.findRow(db, projectId);
    if (!(await this.can("can_manage_members", row.id))) {
      throw forbidden("manage", "Project");
    }
    return row;
  }

  /** A project must always keep at least one owner. */
  private async assertAnotherOwnerRemains(
    db: Database,
    projectId: string,
    excludedUserId: string
  ): Promise<void> {
    const owners = await db
      .select({ userId: projectMember.userId })
      .from(projectMember)
      .where(
        and(
          eq(projectMember.projectId, projectId),
          eq(projectMember.relation, "owner")
        )
      );
    const remaining = owners.filter((owner) => owner.userId !== excludedUserId);
    if (remaining.length === 0) {
      throw forbidden("remove the last owner of", "Project");
    }
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
