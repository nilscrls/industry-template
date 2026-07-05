import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequireAbility } from "../auth/decorators";
import { FlagsService } from "./flags.service";

@Controller()
export class FlagsController {
  constructor(
    private readonly flags: FlagsService,
    private readonly audit: AuditService
  ) {}

  /** Admin-only (only `manage all` grants FeatureFlag access by default). */
  @RequireAbility({ action: "read", subject: "FeatureFlag" })
  @Implement(contract.flags.list)
  list() {
    return implement(contract.flags.list).handler(() => this.flags.list());
  }

  @RequireAbility({ action: "update", subject: "FeatureFlag" })
  @Implement(contract.flags.setOverride)
  setOverride() {
    return implement(contract.flags.setOverride)
      .use(
        this.audit.audited({
          action: "featureFlag.setOverride",
          entityType: "FeatureFlag",
          entityId: (input: { key: string }) => input.key,
        })
      )
      .handler(({ input }) => this.flags.setOverride(input));
  }
}
