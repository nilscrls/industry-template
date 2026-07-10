import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequirePermission } from "../auth/decorators";
import { AuditService } from "./audit.service";

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Admin-only (see `can_read_audit_log` in packages/fga/model.fga). */
  @RequirePermission({ relation: "can_read_audit_log", scope: "org" })
  @Implement(contract.audit.list)
  list() {
    return implement(contract.audit.list).handler(({ input }) =>
      this.audit.list(input)
    );
  }
}
