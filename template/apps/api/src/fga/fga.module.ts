import { Global, Module } from "@nestjs/common";
import { createFgaClient } from "@repo/fga";
import { env } from "../config/env";
import { FGA_CLIENT } from "./fga.constants";
import { FgaService } from "./fga.service";

@Global()
@Module({
  providers: [
    {
      provide: FGA_CLIENT,
      useFactory: () =>
        createFgaClient({
          apiUrl: env.FGA_API_URL,
          storeId: env.FGA_STORE_ID,
          apiToken: env.FGA_API_TOKEN,
          // Pinned in production; empty/unset = the store's latest model.
          modelId: env.FGA_MODEL_ID || undefined,
        }),
    },
    FgaService,
  ],
  exports: [FgaService],
})
export class FgaModule {}
