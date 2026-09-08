import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/decorators";
import { WalletService } from "./wallet.service";

@Controller()
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly audit: AuditService
  ) {}

  /** Any authenticated user, own wallet only — never a 4xx (see the service). */
  @Implement(contract.wallet.me)
  me() {
    return implement(contract.wallet.me).handler(() => this.wallet.me());
  }

  /** Own wallet only — no extra capability beyond being signed in. */
  @Implement(contract.wallet.spend)
  spend() {
    return implement(contract.wallet.spend)
      .use(this.audit.audited({ action: "wallet.spend", entityType: "Wallet" }))
      .handler(({ input }) => this.wallet.spend(input));
  }

  @RequirePermission({ relation: "can_manage_wallet", scope: "org" })
  @Implement(contract.wallet.credit)
  credit() {
    return implement(contract.wallet.credit)
      .use(
        this.audit.audited({ action: "wallet.credit", entityType: "Wallet" })
      )
      .handler(({ input }) => this.wallet.credit(input));
  }
}
