import { Global, Module } from "@nestjs/common";
import { FlagsController } from "./flags.controller";
import { FlagsService } from "./flags.service";

/** Global: any feature module can gate behavior on FlagsService.isEnabled. */
@Global()
@Module({
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
