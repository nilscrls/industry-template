import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/decorators";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService
  ) {}

  @RequirePermission({ relation: "can_read_user", scope: "system" })
  @Implement(contract.users.list)
  list() {
    return implement(contract.users.list).handler(({ input }) =>
      this.users.list(input)
    );
  }

  @RequirePermission({ relation: "can_manage_user", scope: "system" })
  @Implement(contract.users.setRole)
  setRole() {
    return implement(contract.users.setRole)
      .use(this.audit.audited({ action: "user.setRole", entityType: "User" }))
      .handler(({ input }) => this.users.setRole(input));
  }

  /** Any authenticated user — powers the web app's permission provider. */
  @Implement(contract.me.permissions)
  myPermissions() {
    return implement(contract.me.permissions).handler(() =>
      this.users.myPermissions()
    );
  }
}
