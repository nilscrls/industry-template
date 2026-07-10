import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/decorators";
import { FlagsService } from "./flags.service";

@Controller()
export class FlagsController {
  constructor(
    private readonly flags: FlagsService,
    private readonly audit: AuditService
  ) {}

  /** Admin-only (see `can_manage_feature_flag` in packages/fga/model.fga). */
  @RequirePermission({ relation: "can_manage_feature_flag", scope: "org" })
  @Implement(contract.flags.list)
  list() {
    return implement(contract.flags.list).handler(() => this.flags.list());
  }

  @RequirePermission({ relation: "can_manage_feature_flag", scope: "org" })
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
