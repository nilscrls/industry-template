import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { env } from "../config/env";
import { CacheService } from "./cache.service";

export const REDIS = "REDIS_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
