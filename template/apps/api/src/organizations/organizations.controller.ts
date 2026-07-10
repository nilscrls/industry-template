import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequirePermission } from "../auth/decorators";
import { OrganizationsService } from "./organizations.service";

@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Admin-only, cross-tenant — checked against `system:global`. */
  @RequirePermission({ relation: "can_manage_organization", scope: "system" })
  @Implement(contract.organizations.list)
  list() {
    return implement(contract.organizations.list).handler(({ input }) =>
      this.organizations.list(input)
    );
  }
}
