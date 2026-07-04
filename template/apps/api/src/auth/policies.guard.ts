import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { forbidden } from "../common/app-error";
import { requestContext } from "../common/request-context";
import { ABILITY_KEY, type AbilityRequirement } from "./decorators";

/** Enforces @RequireAbility() metadata. Runs after AuthGuard. */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirements = this.reflector.getAllAndOverride<AbilityRequirement[] | undefined>(
      ABILITY_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!requirements || requirements.length === 0) {
      return true;
    }

    const ability = requestContext.getStore()?.ability;
    for (const requirement of requirements) {
      if (!ability?.can(requirement.action, requirement.subject)) {
        throw forbidden(requirement.action, requirement.subject);
      }
    }
    return true;
  }
}
