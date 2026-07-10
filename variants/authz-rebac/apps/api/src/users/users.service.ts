import { Injectable } from "@nestjs/common";
import {
  type Paginated,
  type PaginationQuery,
  type PermissionSnapshot,
  orgCapabilities,
  type OrgCapability,
  type Role,
  roleSchema,
  type SystemCapability,
  systemCapabilities,
  type User,
} from "@repo/contracts";
import { user } from "@repo/db";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "../common/app-error";
import { activeOrganizationId } from "../common/request-context";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";

type ListQuery = PaginationQuery & { search?: string | undefined };
type UserRow = typeof user.$inferSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly fga: FgaService
  ) {}

  private get db() {
    return this.dbService.db;
  }

  async list(query: ListQuery): Promise<Paginated<User>> {
    const where = query.search
      ? or(
          ilike(user.email, `%${query.search}%`),
          ilike(user.name, `%${query.search}%`)
        )
      : undefined;

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(user)
        .where(where)
        .orderBy(desc(user.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(user).where(where),
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

  async setRole(input: { id: string; role: Role }): Promise<User> {
    await this.findRow(input.id);
    // Note: Better-Auth's signed cookie cache may serve the old role for up
    // to its maxAge (5 min). Sessions in redis pick it up on next refresh.
    const [updated] = await this.db
      .update(user)
      .set({ role: input.role })
      .where(eq(user.id, input.id))
      .returning();
    if (!updated) {
      throw notFound("User");
    }
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

  private async findRow(id: string): Promise<UserRow> {
    const [row] = await this.db.select().from(user).where(eq(user.id, id));
    if (!row) {
      throw notFound("User");
    }
    return row;
  }

  private toDto(row: UserRow): User {
    const role = roleSchema.safeParse(row.role);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      role: role.success ? role.data : "member",
      createdAt: row.createdAt.toISOString(),
    };
  }
}
