import { type CustomDecorator, SetMetadata } from "@nestjs/common";
import type { Action, AppSubject } from "@repo/contracts";

export const IS_PUBLIC_KEY = "isPublic";
export const ABILITY_KEY = "requiredAbilities";

/** Skip authentication (health probes, OpenAPI spec, …). */
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export interface AbilityRequirement {
  action: Action;
  subject: AppSubject;
}

/**
 * Coarse, route-level authorization. Row-level checks (ownership conditions)
 * belong in services via `ability.can(action, asSubject(...))`.
 */
export const RequireAbility = (
  ...requirements: AbilityRequirement[]
): CustomDecorator<string> => SetMetadata(ABILITY_KEY, requirements);
