import { Injectable } from "@nestjs/common";
import {
  type AppAbility,
  buildAbility,
  interpolateConditions,
  resolveRules,
} from "@repo/auth";
import {
  adminPermissions,
  baselinePermissions,
  type PermissionRule,
  projectRelationSchema,
  rulesFromMemberships,
} from "@repo/contracts";
import { projectMember } from "@repo/db";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { CacheService } from "../redis/cache.service";

const RULES_TTL_SECONDS = 300;

interface PermissionSource {
  id: string;
  role: string;
}

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
        ? {
            ...rule,
            conditions: interpolateConditions(rule.conditions, {
              userId: user.id,
            }),
          }
        : rule
    );
  }

  /** Call after any membership write — the user's grants changed. */
  invalidateUser(userId: string): Promise<void> {
    return this.cache.del(this.userKey(userId));
  }

  private async rulesFor(user: PermissionSource): Promise<PermissionRule[]> {
    if (user.role === "admin") {
      return adminPermissions;
    }
    const membershipRules = await this.cache.getOrSet(
      this.userKey(user.id),
      RULES_TTL_SECONDS,
      () => this.loadMembershipRules(user.id)
    );
    return resolveRules(baselinePermissions, membershipRules);
  }

  private async loadMembershipRules(userId: string): Promise<PermissionRule[]> {
    const rows = await this.dbService.db
      .select({
        projectId: projectMember.projectId,
        relation: projectMember.relation,
      })
      .from(projectMember)
      .where(eq(projectMember.userId, userId));
    return rulesFromMemberships(
      rows.map((row) => ({
        projectId: row.projectId,
        relation: projectRelationSchema.parse(row.relation),
      }))
    );
  }

  private userKey(userId: string): string {
    return `perm:user:${userId}`;
  }
}
