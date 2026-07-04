import { Global, Module } from "@nestjs/common";
import { createAuth, type Auth } from "@repo/auth";
import type { Redis } from "ioredis";
import { env } from "../config/env";
import { DbService } from "../db/db.module";
import { MailModule } from "../mail/mail.module";
import { MailService } from "../mail/mail.service";
import { REDIS } from "../redis/redis.module";
import { AbilityFactory } from "./ability.factory";

export const AUTH = "BETTER_AUTH_INSTANCE";

@Global()
@Module({
  imports: [MailModule],
  providers: [
    {
      provide: AUTH,
      inject: [DbService, MailService, REDIS],
      useFactory: (dbService: DbService, mail: MailService, redis: Redis): Auth =>
        createAuth({
          db: dbService.db,
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: `${env.WEB_URL}/api`,
          trustedOrigins: [env.WEB_URL],
          sendEmail: async (email) => {
            await mail.enqueueAuthEmail(email);
          },
          secondaryStorage: {
            get: (key) => redis.get(`ba:${key}`),
            set: async (key, value, ttl) => {
              if (ttl) {
                await redis.set(`ba:${key}`, value, "EX", ttl);
              } else {
                await redis.set(`ba:${key}`, value);
              }
            },
            delete: async (key) => {
              await redis.del(`ba:${key}`);
            },
          },
          requireEmailVerification: env.NODE_ENV === "production",
        }),
    },
    AbilityFactory,
  ],
  exports: [AUTH, AbilityFactory],
})
export class AuthModule {}
