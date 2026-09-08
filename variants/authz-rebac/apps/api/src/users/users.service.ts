import { Injectable } from "@nestjs/common";
import {
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
import { notFound } from "../common/app-error";
import { activeOrganizationId } from "../common/request-context";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";

type ListQuery = PaginationQuery & { search?: string | undefined };

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly fga: FgaService
  ) {}

  async list(query: ListQuery): Promise<Paginated<User>> {
    // `user` carries no RLS (D1) — a plain query against the app_user
    // DataSource, no tenant() needed.
    const qb = this.dbService.dataSource
      .createQueryBuilder(UserEntity, "u")
      .orderBy("u.createdAt", "DESC");
    if (query.search) {
      qb.andWhere("(u.email ILIKE :search OR u.name ILIKE :search)", {
        search: `%${query.search}%`,
      });
    }

    const total = await qb.getCount();
    const rows = await qb
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .getMany();

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
    const result = await this.dbService.dataSource
      .createQueryBuilder()
      .update(UserEntity)
      .set({ role: input.role, updatedAt: () => "now()" })
      .where("id = :id", { id: input.id })
      .returning("*")
      .execute();
    if (result.affected !== 1) {
      throw notFound("User");
    }
    const updated = this.dbService.dataSource.manager.create(
      UserEntity,
      result.raw[0] as UserEntity
    );
    // Mirror the role into FGA system tuples (write after the DB commit;
    // pnpm fga:sync reconciles if this write is lost).
    const subject = this.fga.ref.user(input.id);
    const systemObj = this.fga.ref.system();
    if (input.role === "admin") {
      await this.fga.writeTuples([
        { user: subject, relation: "admin", object: systemObj },
      ]);
    } else {
      await this.fga.deleteTuples([
        { user: subject, relation: "admin", object: systemObj },
      ]);
    }
    return this.toDto(updated);
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
    const row = await this.dbService.dataSource.manager.findOneBy(UserEntity, {
      id,
    });
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
