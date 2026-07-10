import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { Redis } from "ioredis";
import { LoggerModule } from "nestjs-pino";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditModule } from "./audit/audit.module";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { PoliciesGuard } from "./auth/policies.guard";
import { AllExceptionsFilter } from "./common/exception.filter";
import { loggerOptions } from "./common/logger";
import { env } from "./config/env";
import { DbModule } from "./db/db.module";
import { DocsModule } from "./docs/docs.module";
import { FilesModule } from "./files/files.module";
import { FlagsModule } from "./flags/flags.module";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { ProjectsModule } from "./projects/projects.module";
import { REDIS } from "./redis/redis.constants";
import { RedisModule } from "./redis/redis.module";
import { UsersModule } from "./users/users.module";

/** Plain options keep BullMQ decoupled from our ioredis instance's version. */
function redisConnectionOptions(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.pathname.length > 1
      ? { db: Number(parsed.pathname.slice(1)) }
      : {}),
    maxRetriesPerRequest: null,
  };
}

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
      connection: redisConnectionOptions(env.REDIS_URL),
    }),
    MailModule,
    AuthModule,
    AuditModule,
    AnalyticsModule,
    HealthModule,
    DocsModule,
    ProjectsModule,
    FilesModule,
    UsersModule,
    OrganizationsModule,
    PrivacyModule,
    FlagsModule,
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
