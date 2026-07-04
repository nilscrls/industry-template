import { Injectable } from "@nestjs/common";
import {
  type Paginated,
  type PaginationQuery,
  type PermissionRule,
  permissionRuleSchema,
  type Role,
  roleSchema,
  type User,
} from "@repo/contracts";
import { user, userPermissionOverride } from "@repo/db";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { AbilityFactory } from "../auth/ability.factory";
import { notFound } from "../common/app-error";
import { currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";

type ListQuery = PaginationQuery & { search?: string | undefined };
type UserRow = typeof user.$inferSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly abilityFactory: AbilityFactory
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
    await this.abilityFactory.invalidateUser(input.id);
    return this.toDto(updated);
  }

  async getPermissionOverrides(
    id: string
  ): Promise<{ overrides: PermissionRule[] }> {
    await this.findRow(id);
    const rows = await this.db
      .select()
      .from(userPermissionOverride)
      .where(eq(userPermissionOverride.userId, id));
    return {
      overrides: rows.map((row) =>
        permissionRuleSchema.parse({
          action: row.action,
          subject: row.subject,
          conditions: row.conditions ?? undefined,
          inverted: row.inverted,
        })
      ),
    };
  }

  async setPermissionOverrides(input: {
    id: string;
    overrides: PermissionRule[];
  }): Promise<{ overrides: PermissionRule[] }> {
    await this.findRow(input.id);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userPermissionOverride)
        .where(eq(userPermissionOverride.userId, input.id));
      if (input.overrides.length > 0) {
        await tx.insert(userPermissionOverride).values(
          input.overrides.map((rule) => ({
            userId: input.id,
            action: rule.action,
            subject: rule.subject,
            conditions: rule.conditions ?? null,
            inverted: rule.inverted ?? false,
          }))
        );
      }
    });
    await this.abilityFactory.invalidateUser(input.id);
    return { overrides: input.overrides };
  }

  myPermissions(): Promise<PermissionRule[]> {
    const me = currentUser();
    // Better-Auth's admin plugin types role as optional on the session user.
    return this.abilityFactory.resolvedRulesFor({
      id: me.id,
      role: me.role ?? "member",
    });
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
