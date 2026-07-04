import { Controller, Get, Inject, Module } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  type HealthIndicatorResult,
  TerminusModule,
} from "@nestjs/terminus";
import type { Redis } from "ioredis";
import { Public } from "../auth/decorators";
import { DbService } from "../db/db.module";
import { REDIS } from "../redis/redis.constants";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbService: DbService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  @Public()
  @Get("live")
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Public()
  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.dbService.ping();
        return { database: { status: "up" } };
      },
      async (): Promise<HealthIndicatorResult> => {
        const pong = await this.redis.ping();
        if (pong !== "PONG") {
          throw new Error("redis unreachable");
        }
        return { redis: { status: "up" } };
      },
    ]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
