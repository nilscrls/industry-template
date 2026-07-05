import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequireAbility } from "../auth/decorators";
import { OrganizationsService } from "./organizations.service";

@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Admin-only (only `manage all` grants Organization access by default). */
  @RequireAbility({ action: "read", subject: "Organization" })
  @Implement(contract.organizations.list)
  list() {
    return implement(contract.organizations.list).handler(({ input }) =>
      this.organizations.list(input)
    );
  }
}
