import { Controller } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { PrivacyService } from "./privacy.service";

@Controller()
export class PrivacyController {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly audit: AuditService
  ) {}

  /**
   * Any authenticated user, own data only. Tighter throttle than the
   * global default: exports walk several tables and have no business
   * being called in a loop. Audited — exports are themselves personal-data
   * processing.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Implement(contract.privacy.exportData)
  exportData() {
    return implement(contract.privacy.exportData)
      .use(
        this.audit.audited({ action: "user.exportData", entityType: "User" })
      )
      .handler(() => this.privacy.exportMyData());
  }
}
