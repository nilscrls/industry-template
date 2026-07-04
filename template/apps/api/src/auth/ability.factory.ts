import { Injectable } from "@nestjs/common";
import { buildAbility, interpolateConditions, resolveRules, type AppAbility } from "@repo/auth";
import { permissionRuleSchema, type PermissionRule } from "@repo/contracts";
import { rolePermission, userPermissionOverride } from "@repo/db";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { CacheService } from "../redis/cache.service";

const RULES_TTL_SECONDS = 300;

type PermissionSource = { id: string; role: string };

@Injectable()
export class AbilityFactory {
  constructor(
    private readonly dbService: DbService,
    private readonly cache: CacheService
  ) {}

  async abilityFor(user: PermissionSource): Promise<AppAbility> {
    return buildAbility(await this.rulesFor(user), { userId: user.id });
  }

  /** Resolved AND interpolated — what /me/permissions returns to the web app. */
  async resolvedRulesFor(user: PermissionSource): Promise<PermissionRule[]> {
    const rules = await this.rulesFor(user);
    return rules.map((rule) =>
      rule.conditions
        ? { ...rule, conditions: interpolateConditions(rule.conditions, { userId: user.id }) }
        : rule
    );
  }

  invalidateUser(userId: string): Promise<void> {
    return this.cache.del(this.userKey(userId));
  }

  invalidateRole(role: string): Promise<void> {
    return this.cache.del(this.roleKey(role));
  }

  private async rulesFor(user: PermissionSource): Promise<PermissionRule[]> {
    const [roleRules, overrides] = await Promise.all([
      this.cache.getOrSet(this.roleKey(user.role), RULES_TTL_SECONDS, () => this.loadRoleRules(user.role)),
      this.cache.getOrSet(this.userKey(user.id), RULES_TTL_SECONDS, () => this.loadOverrides(user.id)),
    ]);
    return resolveRules(roleRules, overrides);
  }

  private async loadRoleRules(role: string): Promise<PermissionRule[]> {
    const rows = await this.dbService.db
      .select()
      .from(rolePermission)
      .where(eq(rolePermission.role, role));
    return rows.map((row) => this.toRule(row));
  }

  private async loadOverrides(userId: string): Promise<PermissionRule[]> {
    const rows = await this.dbService.db
      .select()
      .from(userPermissionOverride)
      .where(eq(userPermissionOverride.userId, userId));
    return rows.map((row) => this.toRule(row));
  }

  private toRule(row: {
    action: string;
    subject: string;
    conditions: Record<string, unknown> | null;
    inverted: boolean;
  }): PermissionRule {
    return permissionRuleSchema.parse({
      action: row.action,
      subject: row.subject,
      conditions: row.conditions ?? undefined,
      inverted: row.inverted,
    });
  }

  private roleKey(role: string): string {
    return `perm:role:${role}`;
  }

  private userKey(userId: string): string {
    return `perm:user:${userId}`;
  }
}
