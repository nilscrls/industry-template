import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequireAbility } from "../auth/decorators";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequireAbility({ action: "read", subject: "User" })
  @Implement(contract.users.list)
  list() {
    return implement(contract.users.list).handler(({ input }) =>
      this.users.list(input)
    );
  }

  @RequireAbility({ action: "update", subject: "User" })
  @Implement(contract.users.setRole)
  setRole() {
    return implement(contract.users.setRole).handler(({ input }) =>
      this.users.setRole(input)
    );
  }

  /** Any authenticated user — powers the web app's ability provider. */
  @Implement(contract.me.permissions)
  myPermissions() {
    return implement(contract.me.permissions).handler(async () => ({
      rules: await this.users.myPermissions(),
    }));
  }
}
