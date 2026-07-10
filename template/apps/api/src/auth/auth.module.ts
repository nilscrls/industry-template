import { Global, Module } from "@nestjs/common";
import { type Auth, createAuth } from "@repo/auth";
import type { Redis } from "ioredis";
import { env } from "../config/env";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";
import { MailModule } from "../mail/mail.module";
import { MailService } from "../mail/mail.service";
import { REDIS } from "../redis/redis.constants";
import { StorageModule } from "../storage/storage.module";
import { StorageService } from "../storage/storage.service";
import { createUserDeletionHooks } from "./user-deletion";

export const AUTH = "BETTER_AUTH_INSTANCE";

// Auth lifecycle → FGA tuples: DB row first, tuple after (FgaService writes
// are idempotent); a genuine failure propagates so nothing drifts silently —
// `pnpm fga:sync` reconciles after incidents.
@Global()
@Module({
  imports: [MailModule, StorageModule],
  providers: [
    {
      provide: AUTH,
      inject: [DbService, MailService, REDIS, StorageService, FgaService],
      useFactory: (
        dbService: DbService,
        mail: MailService,
        redis: Redis,
        storage: StorageService,
        fga: FgaService
      ): Auth => {
        // authDb (BYPASSRLS): the hooks run inside the auth flow, outside
        // any tenant transaction — the sole-owner check must see every
        // membership and the blob prefetch every file row.
        const deletion = createUserDeletionHooks(
          dbService.authDb,
          storage,
          // Erasure also removes the user's tuples (memberships, roles,
          // grants) from the FGA store.
          async (userId) => {
            const tuples = await fga.readUserTuples(fga.ref.user(userId));
            await fga.deleteTuples(tuples);
          }
        );
        return createAuth({
          // BYPASSRLS pool: Better-Auth reads member pre-tenant and owns
          // the user-scoped auth tables (see DbService.authDb).
          db: dbService.authDb,
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: `${env.WEB_URL}/api/auth`,
          trustedOrigins: [env.WEB_URL],
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            tenantId: env.MICROSOFT_TENANT_ID,
          },
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
          onBeforeUserDelete: deletion.beforeDelete,
          onAfterUserDelete: deletion.afterDelete,
          onOrganizationCreated: async ({ organizationId, userId }) => {
            await fga.writeTuples([
              {
                user: fga.ref.system(),
                relation: "system",
                object: fga.ref.org(organizationId),
              },
              {
                user: fga.ref.user(userId),
                relation: "member",
                object: fga.ref.org(organizationId),
              },
            ]);
          },
          onOrganizationDeleted: async ({ organizationId }) => {
            await fga.deleteObjectTuples(fga.ref.org(organizationId));
          },
          onMemberAdded: async ({ organizationId, userId }) => {
            await fga.writeTuples([
              {
                user: fga.ref.user(userId),
                relation: "member",
                object: fga.ref.org(organizationId),
              },
            ]);
          },
          onMemberRemoved: async ({ organizationId, userId }) => {
            await fga.deleteTuples([
              {
                user: fga.ref.user(userId),
                relation: "member",
                object: fga.ref.org(organizationId),
              },
            ]);
          },
        });
      },
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
