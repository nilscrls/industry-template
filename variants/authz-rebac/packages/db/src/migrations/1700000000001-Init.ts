// biome-ignore-all lint/style/useFilenamingConvention: TypeORM orders migrations by the 13 trailing digits of the CLASS name, so the filename must carry them too (1700000000001-Init.ts, not kebab-case).
import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fresh initial schema: Better-Auth tables (read models here, owned by
 * Better-Auth's own pg.Pool adapter), the app tables (project, fileObject,
 * auditLog), the reference "points wallet" (wallet, walletEntry), and —
 * ReBAC overlay only — `projectMember`, the DB source of truth for
 * per-project owner/editor/viewer relations (see docs/authorization.md).
 *
 * Naming: TypeORM's default naming strategy is used everywhere (JS property
 * name == column name), so every identifier below is camelCase and MUST be
 * double-quoted in this raw SQL (`"organizationId"`, not `organization_id`).
 *
 * RLS: every tenant-owned table gets `ENABLE ROW LEVEL SECURITY` plus a
 * single permissive `FOR ALL TO app_user` policy — see docs/database.md.
 * `projectMember` deliberately has NO RLS: every read is already scoped by
 * a `projectId` fetched through `project`'s own policy first.
 */
export class Init1700000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "project_status" AS ENUM('draft', 'active', 'archived');`
    );

    // ---- Better-Auth tables (read models) --------------------------------
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "image" text,
        "role" text NOT NULL DEFAULT 'user',
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "banned" boolean NOT NULL DEFAULT false,
        "banReason" text,
        "banExpires" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "user_email_key" UNIQUE ("email")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "session" (
        "id" text PRIMARY KEY NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "token" text NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" text NOT NULL,
        "impersonatedBy" text,
        "activeOrganizationId" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "session_token_key" UNIQUE ("token"),
        CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "session_userId_idx" ON "session" ("userId");`
    );

    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" text PRIMARY KEY NOT NULL,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" text NOT NULL,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "account_userId_idx" ON "account" ("userId");`
    );

    await queryRunner.query(`
      CREATE TABLE "verification" (
        "id" text PRIMARY KEY NOT NULL,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");`
    );

    await queryRunner.query(`
      CREATE TABLE "organization" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "logo" text,
        "metadata" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz,
        CONSTRAINT "organization_slug_key" UNIQUE ("slug")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "member" (
        "id" text PRIMARY KEY NOT NULL,
        "organizationId" text NOT NULL,
        "userId" text NOT NULL,
        "role" text NOT NULL DEFAULT 'member',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "member_organizationId_idx" ON "member" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "member_userId_idx" ON "member" ("userId");`
    );
    await queryRunner.query(`ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY "member_tenant_isolation" ON "member" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "userId" = current_setting('app.current_user_id', true) OR current_setting('app.is_admin', true) = 'true')
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    await queryRunner.query(`
      CREATE TABLE "invitation" (
        "id" text PRIMARY KEY NOT NULL,
        "organizationId" text NOT NULL,
        "email" text NOT NULL,
        "role" text,
        "status" text NOT NULL DEFAULT 'pending',
        "expiresAt" timestamptz NOT NULL,
        "inviterId" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "invitation_email_idx" ON "invitation" ("email");`
    );
    await queryRunner.query(
      `ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;`
    );
    await queryRunner.query(`
      CREATE POLICY "invitation_tenant_isolation" ON "invitation" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true))
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    await queryRunner.query(`
      CREATE TABLE "twoFactor" (
        "id" text PRIMARY KEY NOT NULL,
        "secret" text NOT NULL,
        "backupCodes" text NOT NULL,
        "userId" text NOT NULL,
        "verified" boolean NOT NULL DEFAULT true,
        "failedVerificationCount" integer NOT NULL DEFAULT 0,
        "lockedUntil" timestamptz,
        CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");`
    );
    await queryRunner.query(
      `CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");`
    );

    // ---- App tables --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "project" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "status" "project_status" NOT NULL DEFAULT 'draft',
        "organizationId" text NOT NULL,
        "ownerId" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "project_organizationId_idx" ON "project" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "project_ownerId_idx" ON "project" ("ownerId");`
    );
    await queryRunner.query(
      `CREATE INDEX "project_status_idx" ON "project" ("status");`
    );
    await queryRunner.query(
      `CREATE INDEX "project_createdAt_idx" ON "project" ("createdAt");`
    );
    await queryRunner.query(`ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY "project_tenant_isolation" ON "project" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "ownerId" = current_setting('app.current_user_id', true))
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    await queryRunner.query(`
      CREATE TABLE "fileObject" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "contentType" varchar(255) NOT NULL,
        "sizeBytes" bigint NOT NULL,
        "storageKey" text NOT NULL,
        "organizationId" text NOT NULL,
        "ownerId" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fileObject_storageKey_key" UNIQUE ("storageKey"),
        CONSTRAINT "fileObject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "fileObject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "fileObject_organizationId_idx" ON "fileObject" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "fileObject_ownerId_idx" ON "fileObject" ("ownerId");`
    );
    await queryRunner.query(
      `ALTER TABLE "fileObject" ENABLE ROW LEVEL SECURITY;`
    );
    await queryRunner.query(`
      CREATE POLICY "fileObject_tenant_isolation" ON "fileObject" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "ownerId" = current_setting('app.current_user_id', true))
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    await queryRunner.query(`
      CREATE TABLE "auditLog" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organizationId" text,
        "actorId" text,
        "action" text NOT NULL,
        "entityType" text NOT NULL,
        "entityId" text,
        "payload" jsonb,
        "requestId" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "auditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL,
        CONSTRAINT "auditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "auditLog_organizationId_idx" ON "auditLog" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "auditLog_actorId_idx" ON "auditLog" ("actorId");`
    );
    await queryRunner.query(
      `CREATE INDEX "auditLog_entityType_idx" ON "auditLog" ("entityType");`
    );
    await queryRunner.query(
      `CREATE INDEX "auditLog_createdAt_idx" ON "auditLog" ("createdAt");`
    );
    await queryRunner.query(
      `ALTER TABLE "auditLog" ENABLE ROW LEVEL SECURITY;`
    );
    await queryRunner.query(`
      CREATE POLICY "auditLog_tenant_isolation" ON "auditLog" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "actorId" = current_setting('app.current_user_id', true))
        WITH CHECK ("organizationId" IS NULL OR "organizationId" = current_setting('app.current_org_id', true));
    `);

    // ---- Reference "points wallet" ------------------------------------
    await queryRunner.query(`
      CREATE TABLE "wallet" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organizationId" text NOT NULL,
        "userId" text NOT NULL,
        "balance" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "wallet_organizationId_userId_key" UNIQUE ("organizationId", "userId"),
        CONSTRAINT "wallet_balance_nonnegative" CHECK ("balance" >= 0),
        CONSTRAINT "wallet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "wallet_organizationId_idx" ON "wallet" ("organizationId");`
    );
    await queryRunner.query(
      `CREATE INDEX "wallet_userId_idx" ON "wallet" ("userId");`
    );
    await queryRunner.query(`ALTER TABLE "wallet" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY "wallet_tenant_isolation" ON "wallet" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "userId" = current_setting('app.current_user_id', true))
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    await queryRunner.query(`
      CREATE TABLE "walletEntry" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "walletId" uuid NOT NULL,
        "organizationId" text NOT NULL,
        "userId" text NOT NULL,
        "amount" integer NOT NULL,
        "reason" varchar(200) NOT NULL,
        "actorId" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "walletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallet"("id") ON DELETE CASCADE,
        CONSTRAINT "walletEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
        CONSTRAINT "walletEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "walletEntry_walletId_idx" ON "walletEntry" ("walletId");`
    );
    await queryRunner.query(
      `CREATE INDEX "walletEntry_organizationId_idx" ON "walletEntry" ("organizationId");`
    );
    await queryRunner.query(
      `ALTER TABLE "walletEntry" ENABLE ROW LEVEL SECURITY;`
    );
    await queryRunner.query(`
      CREATE POLICY "walletEntry_tenant_isolation" ON "walletEntry" AS PERMISSIVE FOR ALL TO app_user
        USING ("organizationId" = current_setting('app.current_org_id', true) OR "userId" = current_setting('app.current_user_id', true))
        WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
    `);

    // ---- ReBAC relationship tuples (rebac overlay only, NO RLS) --------
    await queryRunner.query(`
      CREATE TABLE "projectMember" (
        "projectId" uuid NOT NULL,
        "userId" text NOT NULL,
        "relation" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "projectMember_pkey" PRIMARY KEY ("projectId", "userId"),
        CONSTRAINT "projectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE,
        CONSTRAINT "projectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "projectMember_userId_idx" ON "projectMember" ("userId");`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "projectMember";`);
    await queryRunner.query(`DROP TABLE "walletEntry";`);
    await queryRunner.query(`DROP TABLE "wallet";`);
    await queryRunner.query(`DROP TABLE "auditLog";`);
    await queryRunner.query(`DROP TABLE "fileObject";`);
    await queryRunner.query(`DROP TABLE "project";`);
    await queryRunner.query(`DROP TABLE "twoFactor";`);
    await queryRunner.query(`DROP TABLE "invitation";`);
    await queryRunner.query(`DROP TABLE "member";`);
    await queryRunner.query(`DROP TABLE "organization";`);
    await queryRunner.query(`DROP TABLE "verification";`);
    await queryRunner.query(`DROP TABLE "account";`);
    await queryRunner.query(`DROP TABLE "session";`);
    await queryRunner.query(`DROP TABLE "user";`);
    await queryRunner.query(`DROP TYPE "project_status";`);
  }
}
