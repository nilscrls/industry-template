import { Injectable } from "@nestjs/common";
import {
  type Grant,
  type GrantRelation,
  grantRelations,
  type OrgCapability,
  orgCapabilities,
  type Paginated,
  type PaginationQuery,
  type PermissionSnapshot,
  type Role,
  roleSchema,
  type SystemCapability,
  systemCapabilities,
  type User,
} from "@repo/contracts";
import { User as UserEntity } from "@repo/db";
import type { EntityManager } from "typeorm";
import { notFound } from "../common/app-error";
import { activeOrganizationId } from "../common/request-context";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";

type ListQuery = PaginationQuery & { search?: string | undefined };

const GRANT_RELATIONS = new Set<string>(grantRelations);

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly fga: FgaService
  ) {}

  // This table has no org scoping (Better-Auth read model, global admin
  // listing) — queried directly against the base DataSource, outside
  // dbService.tenant()'s RLS-scoped transaction (same as before the port).
  private get manager(): EntityManager {
    return this.dbService.dataSource.manager;
  }

  async list(query: ListQuery): Promise<Paginated<User>> {
    const qb = this.manager.createQueryBuilder(UserEntity, "u");
    if (query.search) {
      qb.andWhere("(u.email ILIKE :search OR u.name ILIKE :search)", {
        search: `%${query.search}%`,
      });
    }

    const [rows, total] = await Promise.all([
      qb
        .clone()
        .orderBy("u.createdAt", "DESC")
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getMany(),
      qb.clone().getCount(),
    ]);

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async setRole(input: { id: string; role: Role }): Promise<User> {
    await this.findRow(input.id);
    // Note: Better-Auth's signed cookie cache may serve the old role for up
    // to its maxAge (5 min). Sessions in redis pick it up on next refresh.
    const result = await this.manager
      .createQueryBuilder()
      .update(UserEntity)
      .set({ role: input.role, updatedAt: () => "now()" })
      .where("id = :id", { id: input.id })
      .returning("*")
      .execute();
    const updated = result.raw[0] as UserEntity | undefined;
    if (!updated || result.affected !== 1) {
      throw notFound("User");
    }
    // Mirror the role into FGA system tuples (write after the DB commit;
    // pnpm fga:sync reconciles if this write is lost).
    const subject = this.fga.ref.user(input.id);
    const systemObj = this.fga.ref.system();
    const current = await this.fga.readUserTuples(
      subject,
      new Set(["admin", "manager"])
    );
    await this.fga.deleteTuples(
      current.filter(
        (tuple) => tuple.object === systemObj && tuple.relation !== input.role
      )
    );
    if (
      (input.role === "admin" || input.role === "manager") &&
      !current.some(
        (tuple) => tuple.object === systemObj && tuple.relation === input.role
      )
    ) {
      await this.fga.writeTuples([
        { user: subject, relation: input.role, object: systemObj },
      ]);
    }
    return this.toDto(updated);
  }

  /** Per-user resource grants — stored as FGA tuples, nothing in the DB. */
  async getGrants(id: string): Promise<{ grants: Grant[] }> {
    await this.findRow(id);
    const tuples = await this.fga.readUserTuples(
      this.fga.ref.user(id),
      GRANT_RELATIONS
    );
    return {
      grants: tuples.map((tuple) => ({
        object: tuple.object,
        relation: tuple.relation as GrantRelation,
      })),
    };
  }

  async setGrants(input: {
    id: string;
    grants: Grant[];
  }): Promise<{ grants: Grant[] }> {
    await this.findRow(input.id);
    const subject = this.fga.ref.user(input.id);
    const current = await this.fga.readUserTuples(subject, GRANT_RELATIONS);
    const desired = input.grants.map((grant) => ({
      user: subject,
      relation: grant.relation,
      object: grant.object,
    }));
    const key = (tuple: { object: string; relation: string }) =>
      `${tuple.relation}|${tuple.object}`;
    const desiredKeys = new Set(desired.map(key));
    const currentKeys = new Set(current.map(key));
    await this.fga.deleteTuples(
      current.filter((tuple) => !desiredKeys.has(key(tuple)))
    );
    await this.fga.writeTuples(
      desired.filter((tuple) => !currentKeys.has(key(tuple)))
    );
    return { grants: input.grants };
  }

  /** Capability snapshot for the web app (cosmetic gating; api re-checks). */
  async myPermissions(): Promise<PermissionSnapshot> {
    const me = this.fga.me();
    const orgId = activeOrganizationId();
    const [org, system] = await Promise.all([
      orgId
        ? this.fga.listRelations(me, this.fga.ref.org(orgId), [
            ...orgCapabilities,
          ])
        : Promise.resolve([]),
      this.fga.listRelations(me, this.fga.ref.system(), [
        ...systemCapabilities,
      ]),
    ]);
    return {
      org: org as OrgCapability[],
      system: system as SystemCapability[],
    };
  }

  private async findRow(id: string): Promise<UserEntity> {
    const row = await this.manager.findOne(UserEntity, { where: { id } });
    if (!row) {
      throw notFound("User");
    }
    return row;
  }

  private toDto(row: UserEntity): User {
    const role = roleSchema.safeParse(row.role);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      role: role.success ? role.data : "user",
      createdAt: row.createdAt.toISOString(),
    };
  }
}
