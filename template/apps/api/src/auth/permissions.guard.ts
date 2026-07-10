import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { forbidden } from "../common/app-error";
import { activeOrganizationId } from "../common/request-context";
import { FgaService } from "../fga/fga.service";
import { PERMISSION_KEY, type PermissionRequirement } from "./decorators";

/** Enforces @RequirePermission() metadata via OpenFGA. Runs after AuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly fga: FgaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.getAllAndOverride<
      PermissionRequirement[] | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requirements || requirements.length === 0) {
      return true;
    }

    const me = this.fga.me();
    const orgId = activeOrganizationId();
    // org scope without an active org is skipped — services answer with
    // empty lists / explicit 403s (the "fresh user sees nothing" contract).
    const applicable: {
      check: { object: string; relation: string; user: string };
      requirement: PermissionRequirement;
    }[] = [];
    for (const requirement of requirements) {
      if (requirement.scope === "system") {
        applicable.push({
          requirement,
          check: {
            user: me,
            relation: requirement.relation,
            object: this.fga.ref.system(),
          },
        });
      } else if (orgId) {
        applicable.push({
          requirement,
          check: {
            user: me,
            relation: requirement.relation,
            object: this.fga.ref.org(orgId),
          },
        });
      }
    }
    if (applicable.length === 0) {
      return true;
    }

    const results = await this.fga.batchCheck(
      applicable.map((entry) => entry.check)
    );
    const failed = results.indexOf(false);
    if (failed !== -1) {
      const entry = applicable[failed];
      throw forbidden(
        entry?.requirement.relation ?? "access",
        entry?.requirement.scope ?? "org"
      );
    }
    return true;
  }
}
