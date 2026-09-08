import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [AuditModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
