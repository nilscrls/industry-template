import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequireAbility } from "../auth/decorators";
import { AuditService } from "./audit.service";

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Admin-only (only `manage all` grants AuditLog access by default). */
  @RequireAbility({ action: "read", subject: "AuditLog" })
  @Implement(contract.audit.list)
  list() {
    return implement(contract.audit.list).handler(({ input }) =>
      this.audit.list(input)
    );
  }
}
