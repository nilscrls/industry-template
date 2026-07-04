import {
  AbilityBuilder,
  subject as caslSubject,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from "@casl/ability";
import type { Action, AppSubject, PermissionRule } from "@repo/contracts";

/** One ability type for both api (enforcement) and web (UI gating). */
export type AppAbility = MongoAbility<
  [Action, AppSubject | Record<PropertyKey, unknown>]
>;

export interface AbilityContext {
  userId: string;
}

export function interpolateConditions(
  conditions: Record<string, unknown>,
  context: AbilityContext
): MongoQuery {
  return Object.fromEntries(
    Object.entries(conditions).map(([key, value]) => [
      key,
      value === "${userId}" ? context.userId : value,
    ])
  ) as MongoQuery;
}

/**
 * Merge the role baseline with per-user overrides. CASL gives precedence to
 * later rules, so denies are appended last: deny always wins.
 */
export function resolveRules(
  roleRules: PermissionRule[],
  overrides: PermissionRule[]
): PermissionRule[] {
  const combined = [...roleRules, ...overrides];
  return [
    ...combined.filter((rule) => !rule.inverted),
    ...combined.filter((rule) => rule.inverted),
  ];
}

export function buildAbility(
  rules: PermissionRule[],
  context: AbilityContext
): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const rule of rules) {
    const conditions = rule.conditions
      ? interpolateConditions(rule.conditions, context)
      : undefined;
    if (rule.inverted) {
      builder.cannot(rule.action, rule.subject, conditions);
    } else {
      builder.can(rule.action, rule.subject, conditions);
    }
  }
  return builder.build();
}

/** Tag a plain object (e.g. a drizzle row) so CASL can match conditions on it. */
export function asSubject<T extends Record<PropertyKey, unknown>>(
  type: AppSubject,
  object: T
): T {
  return caslSubject(type, object);
}
