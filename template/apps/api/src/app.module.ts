import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { Redis } from "ioredis";
import { LoggerModule } from "nestjs-pino";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { PoliciesGuard } from "./auth/policies.guard";
import { AllExceptionsFilter } from "./common/exception.filter";
import { loggerOptions } from "./common/logger";
import { env } from "./config/env";
import { DbModule } from "./db/db.module";
import { DocsModule } from "./docs/docs.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { ProjectsModule } from "./projects/projects.module";
import { REDIS, RedisModule } from "./redis/redis.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    LoggerModule.forRoot(loggerOptions),
    DbModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    BullModule.forRoot({
      connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    }),
    MailModule,
    AuthModule,
    HealthModule,
    DocsModule,
    ProjectsModule,
    FilesModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
  ],
})
export class AppModule {}
